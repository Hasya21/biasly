import "server-only";
import { getSupabaseAdmin } from "../server";
import type { Json, Log, NewLog } from "../types";
import { checkError, pageBounds, requiredText, uuid } from "../validation";

// Context is deliberately limited to operational counters and fixed categories.
// Never store provider payloads, headers, credentials, URLs, or raw exceptions.
const contextKeys = new Set(["status", "duration_ms", "sources_checked", "candidates_found", "candidates_rejected", "duplicates_skipped", "detail_pages_scraped", "articles_inserted", "articles_rejected", "articles_failed", "analyzed", "skipped", "failed", "batch", "error_code", "jobs_completed", "jobs_skipped", "jobs_failed", "jobs_deferred", "sync_failed", "created", "reused", "reactivated", "deactivated", "embeddings_saved", "embeddings_backfilled"]);
export function safeContext(input: { [key: string]: Json | undefined } = {}): { [key: string]: Json } {
  const result: { [key: string]: Json } = {};
  for (const [key, value] of Object.entries(input)) {
    if (!contextKeys.has(key) && key !== "source_errors") continue;
    if (typeof value === "number" && Number.isFinite(value)) result[key] = value;
    if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value) && ["status", "error_code"].includes(key)) result[key] = value;
  }
  return result;
}

/** message must be a fixed application message, never an exception/provider body. */
export async function insertLog(input: NewLog): Promise<Log> {
  if (!["info", "warn", "error"].includes(input.level)) throw new Error("Invalid log level.");
  const row: NewLog = {
    event_type: requiredText(input.event_type, "Event type"), level: input.level,
    message: requiredText(input.message, "Log message"), context: safeContext(input.context),
    source_id: input.source_id ? uuid(input.source_id) : null,
    article_id: input.article_id ? uuid(input.article_id) : null,
    run_id: input.run_id ? uuid(input.run_id) : null,
  };
  const { data, error } = await getSupabaseAdmin().from("logs").insert(row).select("*").single();
  checkError(error, "insert log");
  if (!data) throw new Error("Log insert returned no row.");
  return data;
}

export async function getLogs(options: { limit?: number; offset?: number; runId?: string } = {}): Promise<Log[]> {
  const { limit, offset } = pageBounds(options.limit, options.offset);
  let query = getSupabaseAdmin().from("logs").select("*");
  if (options.runId) query = query.eq("run_id", uuid(options.runId));
  const { data, error } = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + limit - 1);
  checkError(error, "read logs");
  return data ?? [];
}
