import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, boundedText } from "../api/admin";
import { analyzeArticle, checkAnalysisConfiguration, safeAnalysisError, validateAnalysisInput } from "../ai/analyze-article";
import { generateArticleEmbedding } from "../ai/embed-article";
import { AnalysisError } from "../ai/analysis-schema";
import { getPendingArticles } from "../supabase/queries/articles";
import { saveArticleAnalysis, saveArticleEmbedding } from "../supabase/queries/analyses";
import { insertLog } from "../supabase/queries/logs";
import type { PendingCursor } from "../supabase/types";
import { MAX_REQUEST_BYTES } from "./limits";
import { remainingTime, withoutBudget } from "./budget";

const optionsSchema = z.object({
  limit: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional(),
  articleIds: z.array(z.uuid()).min(1).max(100).optional(),
}).strict();
export type AnalysisOptions = z.infer<typeof optionsSchema>;
export async function readAnalysisOptions(request: Request): Promise<AnalysisOptions> {
  const text = await boundedText(request.body, MAX_REQUEST_BYTES);
  try { return optionsSchema.parse(text.trim() ? JSON.parse(text) : {}); }
  catch { throw new ApiError(400, "Invalid analysis options."); }
}
export function analysisBatchSize(): number {
  const raw = process.env.ANALYSIS_BATCH_SIZE ?? "5";
  const size = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(size) || size < 1 || size > 100) throw new AnalysisError("invalid_batch_size", true);
  return size;
}
export type AnalysisSummary = {
  run_id: string; status: "completed" | "partial" | "failed";
  attempted: number; analyzed: number; skipped: number; failed: number; batches: number;
  analysis_generated: number; embeddings_saved: number; embeddings_backfilled: number;
  duration_ms: number; logging_failures: number; failure_reasons: Record<string, number>;
  stop_reason: "exhausted" | "limit_reached" | "fatal_error" | "deadline";
};
const defaults = { pending: getPendingArticles, analyze: analyzeArticle, embed: generateArticleEmbedding, save: saveArticleAnalysis, saveEmbedding: saveArticleEmbedding, log: insertLog, configure: checkAnalysisConfiguration };
export type AnalysisDependencies = typeof defaults;

export async function runAnalysis(input: AnalysisOptions = {}, deps: AnalysisDependencies = defaults): Promise<AnalysisSummary> {
  const options = optionsSchema.parse(input);
  const start = Date.now();
  const summary: AnalysisSummary = { run_id: randomUUID(), status: "completed", attempted: 0, analyzed: 0, skipped: 0, failed: 0, batches: 0, analysis_generated: 0, embeddings_saved: 0, embeddings_backfilled: 0, duration_ms: 0, logging_failures: 0, failure_reasons: {}, stop_reason: "exhausted" };
  const failure = (code: string) => { summary.failure_reasons[code] = (summary.failure_reasons[code] ?? 0) + 1; };
  const log = async (event: string, articleId?: string, code?: string, counts = { analyzed: summary.analyzed, embeddings_saved: summary.embeddings_saved, embeddings_backfilled: summary.embeddings_backfilled, skipped: summary.skipped, failed: summary.failed }) => {
    console.info(`[analysis] ${event}`, { ...counts, batch: summary.batches, ...(articleId ? { article_id: articleId } : {}), ...(code ? { error_code: code } : {}) });
    try {
      await deps.log({ event_type: `analysis_${event}`, message: `Analysis ${event}.`, level: code ? "error" : summary.status === "completed" ? "info" : "warn", run_id: summary.run_id, article_id: articleId,
        context: { ...counts, batch: summary.batches, status: event === "finished" ? summary.status : "running", duration_ms: Date.now() - start, error_code: code } });
    } catch { summary.logging_failures++; console.warn("[analysis] log persistence failed"); }
  };
  await log("started");
  try {
    const batchSize = analysisBatchSize();
    deps.configure();
    let after: PendingCursor | undefined;
    let halted = false;
    while (!halted) {
      if (remainingTime() < 30_000) { summary.stop_reason = "deadline"; break; }
      const remaining = options.limit === undefined ? batchSize : Math.min(batchSize, options.limit - summary.attempted);
      if (remaining === 0) { summary.stop_reason = "limit_reached"; break; }
      const articles = await deps.pending({ limit: remaining, after, articleIds: options.articleIds });
      if (!articles.length) break;
      summary.batches++;
      const batch = { analyzed: 0, embeddings_saved: 0, embeddings_backfilled: 0, skipped: 0, failed: 0 };
      for (const article of articles) {
        if (remainingTime() < 30_000) { summary.stop_reason = "deadline"; halted = true; break; }
        after = { scraped_at: article.scraped_at, id: article.id };
        summary.attempted++;
        try {
          validateAnalysisInput(article);
          const observability = { sessionId: summary.run_id, traceId: randomUUID() };
          if (article.needs_analysis) {
            const analysis = await deps.analyze(article, undefined, observability);
            summary.analysis_generated++;
            const embedding = await deps.embed(article, analysis.summary, undefined, observability);
            await deps.save(article.id, analysis, embedding);
            summary.analyzed++; batch.analyzed++;
          } else {
            if (!article.analysis_summary) throw new AnalysisError("missing_existing_summary");
            const embedding = await deps.embed(article, article.analysis_summary, undefined, observability);
            await deps.saveEmbedding(article.id, embedding);
            summary.embeddings_backfilled++; batch.embeddings_backfilled++;
          }
          summary.embeddings_saved++; batch.embeddings_saved++;
        } catch (error) {
          if (remainingTime() < 5_000) { summary.stop_reason = "deadline"; halted = true; break; }
          const safe = safeAnalysisError(error);
          if (["invalid_article", "article_too_large"].includes(safe.code)) { summary.skipped++; batch.skipped++; }
          else { summary.failed++; batch.failed++; }
          failure(safe.code);
          await log("article_failed", article.id, safe.code);
          if (safe.fatal) { halted = true; summary.stop_reason = "fatal_error"; break; }
        }
      }
      await log("batch_completed", undefined, undefined, batch);
    }
  } catch (error) {
    const safe = safeAnalysisError(error);
    failure(safe.code);
    summary.stop_reason = remainingTime() < 5_000 ? "deadline" : "fatal_error";
    await log("run_failed", undefined, safe.code);
  }
  summary.status = summary.stop_reason === "fatal_error" && summary.analyzed === 0 ? "failed"
    : summary.failed || summary.skipped || summary.logging_failures || summary.stop_reason === "fatal_error" || summary.stop_reason === "deadline" ? "partial" : "completed";
  summary.duration_ms = Date.now() - start;
  await withoutBudget(() => log("finished"));
  if (summary.logging_failures && summary.status === "completed") summary.status = "partial";
  summary.duration_ms = Date.now() - start;
  console.info("[analysis] summary", summary);
  return summary;
}
