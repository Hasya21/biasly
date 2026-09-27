import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "../api/admin";
import { claimRetryableRun, finishScheduleRun } from "../supabase/queries/schedules";
import { ScrapeError } from "../scraping/oxylabs";
import { publisherUrl } from "../parsing/urls";
import { processHomepage, defaultScrapeDependencies, type ScrapeOptions, type ScrapeSummary } from "./scrape";
import { scheduleDependencies, reconcileSchedules } from "./schedules";
import { remainingTime, requireTime, withinBudget, withoutBudget } from "./budget";
import { withPipelineLease } from "./lease";

export const processingDependencies = { ...scheduleDependencies, scrape: defaultScrapeDependencies, claim: claimRetryableRun, finish: finishScheduleRun, reconcile: reconcileSchedules };
export type ProcessingDependencies = typeof processingDependencies;
export type ScheduledSummary = ScrapeSummary & { jobs_completed: number; jobs_skipped: number; jobs_failed: number; jobs_deferred: number; source_errors: number; sync_failed: number };

/** Run under the scheduler lease; exported separately for deterministic integration tests. */
export async function processScheduledResults(options: ScrapeOptions, deps: ProcessingDependencies = processingDependencies): Promise<ScheduledSummary> {
  const start = Date.now();
  const summary: ScheduledSummary = { run_id: randomUUID(), status: "completed", sources_checked: 0, candidates_found: 0, candidates_rejected: 0, duplicates_skipped: 0, detail_pages_scraped: 0, articles_inserted: 0, articles_rejected: 0, articles_failed: 0, duration_ms: 0, rejection_reasons: {}, sources: [], logging_failures: 0, jobs_completed: 0, jobs_skipped: 0, jobs_failed: 0, jobs_deferred: 0, source_errors: 0, sync_failed: 0 };
  const log = async (event: string) => {
    console.info(`[scheduler] ${event}`, summary);
    try { await deps.scrape.log({ event_type: `scheduler_${event}`, level: summary.status === "completed" ? "info" : "warn", message: `Scheduler ${event}.`, run_id: summary.run_id, context: { ...summary, sources: undefined, rejection_reasons: undefined } }); }
    catch { summary.logging_failures++; }
  };
  const active = await deps.sources();
  if (options.sourceIds?.some(id => !active.some(source => source.id === id))) throw new ApiError(400, "Selected sources must exist and be active.");
  await log("started");
  try {
    const sync = await deps.reconcile(deps, active);
    summary.sync_failed = sync.failed;
    const schedules = await deps.schedules();
    const selected = active.filter(source => !options.sourceIds || options.sourceIds.includes(source.id));
    for (const source of selected) {
      requireTime(40_000);
      summary.sources_checked++;
      let inserted = 0;
      console.info("[scheduler] source started", { source: source.name });
      try {
        const schedule = schedules.find(row => row.source_id === source.id && row.state === "active" && row.listing_url === source.listing_url);
        if (!schedule) throw new ScrapeError("scheduler_missing_mapping");
        // Newest pages first: old provider results may expire after 24 hours.
        const runs = (await deps.provider.runs(schedule.schedule_id)).sort((a, b) => BigInt(a.run_id) > BigInt(b.run_id) ? -1 : BigInt(a.run_id) < BigInt(b.run_id) ? 1 : 0);
        for (const run of runs) for (const job of run.jobs) {
          if (job.result_status !== "done") { summary.jobs_skipped++; continue; }
          if (inserted >= options.limitPerSource || remainingTime() < 40_000) { summary.jobs_deferred++; continue; }
          const claim = await deps.claim({ schedule_id: schedule.id, external_run_id: run.run_id, job_id: job.id });
          if (!claim) { summary.jobs_skipped++; continue; }
          const before = summary.articles_inserted;
          const failedBefore = summary.articles_failed;
          let code: string | undefined;
          let fatal = false;
          try {
            const result = await deps.provider.result(job.id);
            const entry = publisherUrl(source.listing_url, source);
            if (publisherUrl(result.url, source).replace(/\/$/, "") !== entry.replace(/\/$/, "")) throw new ScrapeError("scheduler_url_mismatch");
            console.info("[scheduler] homepage fetched", { source: source.name });
            const outcome = await processHomepage(source, result.html, options.limitPerSource - inserted, summary, deps.scrape);
            if (summary.articles_failed > failedBefore || outcome.outcome === "attempt_limit") code = "DETAIL_PROCESSING";
          } catch (error) {
            code = remainingTime() < 10_000 ? "DEADLINE" : error instanceof ScrapeError ? error.code.toUpperCase() : "JOB_PROCESSING";
            fatal = error instanceof ScrapeError && error.fatal;
          }
          inserted += summary.articles_inserted - before;
          const finished = await withoutBudget(() => deps.finish(claim.id, code ? "failed" : "completed", {
            articles_inserted: summary.articles_inserted - before, articles_failed: summary.articles_failed - failedBefore,
            status: code ? "failed" : "completed",
          }, code, claim.started_at));
          if (!finished) throw new ScrapeError("scheduler_claim_lost", true);
          if (code === "DEADLINE") summary.jobs_deferred++;
          else if (code) summary.jobs_failed++;
          else summary.jobs_completed++;
          if (fatal) throw new ScrapeError(code ?? "provider_auth", true);
        }
      } catch (error) {
        summary.source_errors++;
        console.warn("[scheduler] source failed", { source: source.name, error_code: error instanceof ScrapeError ? error.code : "source_processing" });
        if (error instanceof ScrapeError && error.fatal) throw error;
      }
    }
  } catch (error) {
    if (remainingTime() < 40_000) summary.jobs_deferred++;
    else summary.status = "failed";
    console.warn("[scheduler] processing stopped", { error_code: error instanceof ScrapeError ? error.code : "processing_stopped" });
  }
  if (summary.status !== "failed" && (summary.jobs_failed || summary.jobs_deferred || summary.source_errors || summary.sync_failed || summary.logging_failures)) summary.status = "partial";
  summary.duration_ms = Date.now() - start;
  await withoutBudget(() => log("finished"));
  if (summary.logging_failures && summary.status === "completed") summary.status = "partial";
  return summary;
}

export function runScheduledResults(options: ScrapeOptions, deadline = Date.now() + 720_000): Promise<ScheduledSummary> {
  return withPipelineLease("scheduler", () => withinBudget(deadline, () => processScheduledResults(options)));
}
