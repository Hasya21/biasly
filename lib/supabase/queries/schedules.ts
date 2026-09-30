import "server-only";
import { getSupabaseAdmin } from "../server";
import type { Json, NewRun, NewSchedule, Schedule, ScheduleRun } from "../types";
import { checkError, externalId, httpUrl, pageBounds, uuid } from "../validation";
import { safeContext } from "./logs";

export async function markScheduleAttempt(id: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin().from("oxylabs_schedules")
    .update({ last_attempted_at: new Date().toISOString() }).eq("id", uuid(id)).select("id").single();
  checkError(error, "record schedule attempt");
  if (!data) throw new Error("Schedule attempt returned no row.");
}

export async function saveSchedule(input: NewSchedule): Promise<Schedule> {
  if (!["active", "inactive"].includes(input.state)) throw new Error("Invalid schedule state.");
  const row = { source_id: uuid(input.source_id), schedule_id: externalId(input.schedule_id), state: input.state,
    ...(input.listing_url ? { listing_url: httpUrl(input.listing_url) } : {}) };
  const { data, error } = await getSupabaseAdmin().from("oxylabs_schedules").upsert(row, { onConflict: "source_id" }).select("*").single();
  checkError(error, "save schedule");
  if (!data) throw new Error("Schedule save returned no row.");
  return data;
}
export async function getSchedules(options: { limit?: number; offset?: number } = {}): Promise<Schedule[]> {
  const { limit, offset } = pageBounds(options.limit, options.offset);
  const { data, error } = await getSupabaseAdmin().from("oxylabs_schedules").select("*").order("created_at").order("id").range(offset, offset + limit - 1);
  checkError(error, "read schedules");
  return data ?? [];
}

/** Unique job_id is the claim: only the insert winner may process the job. */
export async function claimScheduleRun(input: NewRun): Promise<ScheduleRun | null> {
  const row = { schedule_id: uuid(input.schedule_id), external_run_id: externalId(input.external_run_id), job_id: externalId(input.job_id) };
  const { data, error } = await getSupabaseAdmin().from("oxylabs_schedule_runs").insert(row).select("*").single();
  if (error?.code === "23505") return null;
  checkError(error, "claim schedule run");
  return data;
}
export async function finishScheduleRun(id: string, status: "completed" | "failed", summary: { [key: string]: Json | undefined } = {}, errorCode?: string, startedAt?: string): Promise<ScheduleRun | null> {
  if (!["completed", "failed"].includes(status) || (errorCode !== undefined && !/^[A-Z0-9_]{1,64}$/.test(errorCode))) throw new Error("Invalid run completion.");
  let query = getSupabaseAdmin().from("oxylabs_schedule_runs").update({
    status, completed_at: new Date().toISOString(), summary: safeContext(summary), error_code: errorCode ?? null,
  }).eq("id", uuid(id)).eq("status", "processing");
  if (startedAt) query = query.eq("started_at", startedAt);
  const { data, error } = await query.select("*").maybeSingle();
  checkError(error, "finish schedule run");
  return data;
}

/** Retry once per invocation; compare the previous timestamp/status to fence stale workers. */
export async function claimRetryableRun(input: NewRun): Promise<ScheduleRun | null> {
  const claimed = await claimScheduleRun(input);
  if (claimed) return claimed;
  const { data: previous, error } = await getSupabaseAdmin().from("oxylabs_schedule_runs").select("*").eq("job_id", externalId(input.job_id)).maybeSingle();
  checkError(error, "read previous job claim");
  if (!previous || previous.status === "completed" || previous.error_code === "SCHEDULER_NOT_FOUND" || (previous.status === "processing" && Date.parse(previous.started_at) > Date.now() - 900_000)) return null;
  const { data, error: updateError } = await getSupabaseAdmin().from("oxylabs_schedule_runs")
    .update({ status: "processing", started_at: new Date().toISOString(), completed_at: null, error_code: null, summary: {} })
    .eq("id", previous.id).eq("status", previous.status).eq("started_at", previous.started_at).select("*").maybeSingle();
  checkError(updateError, "retry job claim");
  return data;
}

export async function allSchedules(): Promise<Schedule[]> {
  const rows: Schedule[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await getSchedules({ limit: 100, offset });
    rows.push(...page);
    if (page.length < 100) return rows;
  }
}
export async function getScheduleRuns(scheduleId: string, options: { limit?: number; offset?: number } = {}): Promise<ScheduleRun[]> {
  const { limit, offset } = pageBounds(options.limit, options.offset);
  const { data, error } = await getSupabaseAdmin().from("oxylabs_schedule_runs").select("*").eq("schedule_id", uuid(scheduleId))
    .order("started_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
  checkError(error, "read schedule runs");
  return data ?? [];
}
