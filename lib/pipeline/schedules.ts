import "server-only";
import { allSchedules, saveSchedule } from "../supabase/queries/schedules";
import { SchedulerClient, SCHEDULE_CRON, providerDate } from "../scraping/oxylabs-scheduler";
import { ScrapeError } from "../scraping/oxylabs";
import { allActiveSources } from "./scrape";
import { requireTime, withinBudget } from "./budget";
import { withPipelineLease } from "./lease";
import type { Source } from "../supabase/types";
import { randomUUID } from "node:crypto";
import { insertLog } from "../supabase/queries/logs";

export const scheduleDependencies = { sources: allActiveSources, schedules: allSchedules, save: saveSchedule, provider: new SchedulerClient() };
export type ScheduleDependencies = typeof scheduleDependencies;
export type SyncSummary = { status: "completed" | "partial"; created: number; reused: number; reactivated: number; deactivated: number; failed: number; duration_ms: number };

/** Caller must hold the scheduler lease, including while orphan cleanup is running. */
export async function reconcileSchedules(deps: ScheduleDependencies = scheduleDependencies, selected?: Source[]): Promise<SyncSummary> {
  const started = Date.now();
  const summary: SyncSummary = { status: "completed", created: 0, reused: 0, reactivated: 0, deactivated: 0, failed: 0, duration_ms: 0 };
  const active = selected ?? await deps.sources();
  const stored = await deps.schedules();
  console.info("[scheduler] sync started", { sources: active.map(source => source.name) });
  for (const source of active) {
    requireTime(40_000);
    try {
      const row = stored.find(schedule => schedule.source_id === source.id);
      const remote = row ? await deps.provider.info(row.schedule_id) : null;
      const reusable = remote && row?.listing_url === source.listing_url && remote.cron === SCHEDULE_CRON && remote.items_count === 1 && providerDate(remote.end_time) > Date.now() + 7 * 86_400_000;
      if (reusable && row) {
        if (!remote.active) { await deps.provider.state(remote.schedule_id, true); summary.reactivated++; }
        else summary.reused++;
        if (row.state !== "active") await deps.save({ ...row, state: "active" });
        continue;
      }
      const created = await deps.provider.create(source.listing_url);
      // Persist immediately. On a failed write, stop the new recurring charge where possible.
      try { await deps.save({ source_id: source.id, schedule_id: created.schedule_id, state: "active", listing_url: source.listing_url }); }
      catch (error) {
        try { await deps.provider.state(created.schedule_id, false); } catch { console.warn("[scheduler] schedule compensation failed"); }
        throw error;
      }
      summary.created++;
      if (remote?.active) { await deps.provider.state(remote.schedule_id, false); summary.deactivated++; }
    } catch (error) {
      summary.failed++;
      console.warn("[scheduler] source sync failed", { source: source.name, error_code: error instanceof ScrapeError ? error.code : "schedule_sync" });
      if (error instanceof ScrapeError && error.fatal) throw error;
    }
  }
  // Enumerate the complete database set before deactivating anything on the account.
  const current = await deps.schedules();
  for (const row of current.filter(row => !active.some(source => source.id === row.source_id))) {
    requireTime(35_000);
    try {
      const remote = await deps.provider.info(row.schedule_id);
      if (remote?.active) { await deps.provider.state(row.schedule_id, false); summary.deactivated++; }
      if (row.state !== "inactive") await deps.save({ ...row, state: "inactive" });
    } catch (error) { summary.failed++; if (error instanceof ScrapeError && error.fatal) throw error; }
  }
  const ids = await deps.provider.list();
  const live = new Set((await deps.schedules()).map(row => row.schedule_id));
  for (const id of ids.filter(id => !live.has(id))) {
    requireTime(35_000);
    try {
      const remote = await deps.provider.info(id);
      if (remote?.active) { await deps.provider.state(id, false); summary.deactivated++; }
    } catch (error) { summary.failed++; if (error instanceof ScrapeError && error.fatal) throw error; }
  }
  summary.status = summary.failed ? "partial" : "completed";
  summary.duration_ms = Date.now() - started;
  console.info("[scheduler] sync finished", summary);
  return summary;
}

export function syncSchedules(): Promise<SyncSummary> {
  return withPipelineLease("scheduler", async () => {
    const summary = await withinBudget(Date.now() + 240_000, () => reconcileSchedules());
    try { await insertLog({ event_type: "scheduler_sync", level: summary.failed ? "warn" : "info", message: "Scheduler synchronization finished.", run_id: randomUUID(), context: summary }); }
    catch { summary.status = "partial"; summary.failed++; console.warn("[scheduler] sync log persistence failed"); }
    return summary;
  });
}
