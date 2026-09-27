import "server-only";
import { randomUUID } from "node:crypto";
import { runAnalysis } from "./analyze";
import { runScheduledResults } from "./scheduled-results";
import { withinBudget } from "./budget";
import { withPipelineLease } from "./lease";
import { DEFAULT_ARTICLE_LIMIT } from "./limits";
import { insertLog } from "../supabase/queries/logs";

const defaults = { process: runScheduledResults, analyze: runAnalysis, log: insertLog };
type PhaseFailure = { status: "failed"; error_code: string };
export async function executeCronPipeline(deps = defaults) {
  const start = Date.now();
  const runId = randomUUID();
  let processing: Awaited<ReturnType<typeof runScheduledResults>> | PhaseFailure;
  let analysis: Awaited<ReturnType<typeof runAnalysis>> | PhaseFailure;
  console.info("[cron] started");
  try { processing = await deps.process({ limitPerSource: DEFAULT_ARTICLE_LIMIT }, start + 390_000); }
  catch { processing = { status: "failed", error_code: "SCHEDULED_PROCESSING" }; }
  // This phase is deliberately independent of the processing result, including thrown errors.
  try { analysis = await withinBudget(start + 680_000, () => deps.analyze({})); }
  catch { analysis = { status: "failed", error_code: "ANALYSIS_PROCESSING" }; }
  const status = processing.status === "failed" && analysis.status === "failed" ? "failed"
    : processing.status === "completed" && analysis.status === "completed" ? "completed" : "partial";
  const summary = { run_id: runId, status, processing, analysis, duration_ms: Date.now() - start };
  try { await deps.log({ event_type: "cron_finished", level: status === "completed" ? "info" : "warn", message: "Hourly pipeline finished.", run_id: runId, context: { status, duration_ms: summary.duration_ms } }); }
  catch { console.warn("[cron] log persistence failed"); }
  console.info("[cron] finished", summary);
  return summary;
}
export function runCronPipeline() { return withPipelineLease("hourly_pipeline", () => executeCronPipeline()); }
