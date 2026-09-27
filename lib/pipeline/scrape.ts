import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ApiError, boundedText } from "../api/admin";
import { getActiveSources } from "../supabase/queries/sources";
import { findExistingArticleUrls, insertArticle } from "../supabase/queries/articles";
import { insertLog } from "../supabase/queries/logs";
import type { Source } from "../supabase/types";
import { extractCandidates, parseArticle } from "../parsing/articles";
import { publisherUrl, strategyFor } from "../parsing/urls";
import { checkScrapeConfiguration, fetchPage, ScrapeError } from "../scraping/oxylabs";
import { DEFAULT_ARTICLE_LIMIT, MAX_ARTICLE_LIMIT, MAX_REQUEST_BYTES, detailAttemptLimit } from "./limits";
import { requireTime } from "./budget";

const optionsSchema = z.object({ sourceIds: z.array(z.uuid()).min(1).max(100).optional(), limitPerSource: z.number().int().min(1).max(MAX_ARTICLE_LIMIT).default(DEFAULT_ARTICLE_LIMIT) }).strict();
export type ScrapeOptions = z.infer<typeof optionsSchema>;
export async function readScrapeOptions(request: Request): Promise<ScrapeOptions> {
  const text = await boundedText(request.body, MAX_REQUEST_BYTES);
  try { return optionsSchema.parse(text.trim() ? JSON.parse(text) : {}); }
  catch { throw new ApiError(400, "Invalid scraping options."); }
}
export async function allActiveSources(): Promise<Source[]> {
  const sources: Source[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await getActiveSources({ limit: 100, offset });
    sources.push(...page);
    if (page.length < 100) return sources;
  }
}
export type SourceOutcome = { source_id: string; name: string; inserted: number; attempted: number; outcome: "limit_reached" | "exhausted" | "attempt_limit" | "failed"; error_code?: string };
export type ScrapeSummary = {
  run_id: string; status: "completed" | "partial" | "failed"; sources_checked: number;
  candidates_found: number; candidates_rejected: number; duplicates_skipped: number;
  detail_pages_scraped: number; articles_inserted: number; articles_rejected: number; articles_failed: number;
  duration_ms: number; rejection_reasons: Record<string, number>; sources: SourceOutcome[]; logging_failures: number;
};
export const defaultScrapeDependencies = { sources: allActiveSources, fetch: fetchPage, existing: findExistingArticleUrls, insert: insertArticle, log: insertLog };
const defaultDependencies = defaultScrapeDependencies;
export type ScrapeDependencies = typeof defaultDependencies;

/** Also used by future Scheduler processing with an already fetched homepage. */
export async function processHomepage(source: Source, html: string, limit: number, summary: ScrapeSummary, deps: ScrapeDependencies): Promise<SourceOutcome> {
  const outcome: SourceOutcome = { source_id: source.id, name: source.name, inserted: 0, attempted: 0, outcome: "exhausted" };
  summary.sources.push(outcome);
  const candidates = extractCandidates(html, source);
  summary.candidates_found += candidates.found;
  summary.candidates_rejected += candidates.rejected;
  summary.duplicates_skipped += candidates.duplicates;
  summary.rejection_reasons.candidate_url = (summary.rejection_reasons.candidate_url ?? 0) + candidates.rejected;
  console.info("[scrape] candidates", { source: source.name, found: candidates.found, rejected: candidates.rejected });
  const existing = await deps.existing(candidates.urls);
  for (const url of candidates.urls) {
    requireTime(10_000);
    if (outcome.inserted >= limit) { outcome.outcome = "limit_reached"; break; }
    if (existing.has(url)) { summary.duplicates_skipped++; console.info("[scrape] duplicate skipped", { source: source.name }); continue; }
    if (outcome.attempted >= detailAttemptLimit(limit)) { outcome.outcome = "attempt_limit"; break; }
    outcome.attempted++;
    try {
      const detail = await deps.fetch(url);
      summary.detail_pages_scraped++;
      console.info("[scrape] detail fetched", { source: source.name, attempted: outcome.attempted });
      const parsed = parseArticle(detail.html, url, detail.url, source);
      if ("reason" in parsed) {
        summary.articles_rejected++;
        summary.rejection_reasons[parsed.reason] = (summary.rejection_reasons[parsed.reason] ?? 0) + 1;
        console.info("[scrape] article rejected", { source: source.name, reason: parsed.reason });
        continue;
      }
      const collision = await deps.existing([parsed.article.original_url, parsed.article.canonical_url]);
      if (collision.size || (await deps.insert(parsed.article)).status === "duplicate") { summary.duplicates_skipped++; continue; }
      outcome.inserted++;
      summary.articles_inserted++;
      console.info("[scrape] article inserted", { source: source.name, inserted: outcome.inserted });
    } catch (error) {
      summary.articles_failed++;
      console.warn("[scrape] article failed", { source: source.name, error_code: error instanceof ScrapeError ? error.code : "article_processing" });
      if (error instanceof ScrapeError && error.fatal) throw error;
    }
  }
  if (outcome.inserted >= limit) outcome.outcome = "limit_reached";
  return outcome;
}

export async function runScrape(options: ScrapeOptions, dependencies: ScrapeDependencies = defaultDependencies): Promise<ScrapeSummary> {
  const start = Date.now();
  const active = await dependencies.sources();
  const ids = options.sourceIds ? new Set(options.sourceIds) : null;
  if (ids && [...ids].some(id => !active.some(source => source.id === id))) throw new ApiError(400, "Selected sources must exist and be active.");
  const sources = active.filter(source => !ids || ids.has(source.id));
  if (dependencies === defaultDependencies) checkScrapeConfiguration();
  const summary: ScrapeSummary = { run_id: randomUUID(), status: "completed", sources_checked: 0, candidates_found: 0, candidates_rejected: 0, duplicates_skipped: 0, detail_pages_scraped: 0, articles_inserted: 0, articles_rejected: 0, articles_failed: 0, duration_ms: 0, rejection_reasons: {}, sources: [], logging_failures: 0 };
  const log = async (event: string, source?: Source, errorCode?: string) => {
    try { await dependencies.log({ event_type: event, level: event === "source_failed" || summary.status === "failed" ? "error" : summary.status === "partial" ? "warn" : "info", message: `Scraping ${event}.`, run_id: summary.run_id, source_id: source?.id, context: { status: event === "started" ? "running" : summary.status, error_code: errorCode, duration_ms: Date.now() - start, sources_checked: summary.sources_checked, candidates_found: summary.candidates_found, candidates_rejected: summary.candidates_rejected, duplicates_skipped: summary.duplicates_skipped, detail_pages_scraped: summary.detail_pages_scraped, articles_inserted: summary.articles_inserted, articles_rejected: summary.articles_rejected, articles_failed: summary.articles_failed } }); }
    catch { summary.logging_failures++; console.warn("[scrape] log persistence failed"); }
  };
  console.info("[scrape] started", { sources: sources.map(source => source.name), limit: options.limitPerSource });
  await log("started");
  for (const source of sources) {
    summary.sources_checked++;
    console.info("[scrape] source started", { source: source.name });
    try {
      strategyFor(source);
      const homepage = await dependencies.fetch(publisherUrl(source.listing_url, source));
      publisherUrl(homepage.url, source);
      console.info("[scrape] homepage fetched", { source: source.name });
      await processHomepage(source, homepage.html, options.limitPerSource, summary, dependencies);
    } catch (error) {
      const code = error instanceof ScrapeError ? error.code : "source_processing";
      const outcome = summary.sources.find(item => item.source_id === source.id);
      if (outcome) { outcome.outcome = "failed"; outcome.error_code = code; }
      else summary.sources.push({ source_id: source.id, name: source.name, inserted: 0, attempted: 0, outcome: "failed", error_code: code });
      console.warn("[scrape] source failed", { source: source.name, error_code: code });
      summary.status = "partial";
      await log("source_failed", source, code);
      if (error instanceof ScrapeError && error.fatal) break;
      continue;
    }
    await log("source_completed", source);
  }
  const hasFailure = summary.sources.some(source => source.outcome === "failed" || source.outcome === "attempt_limit") || summary.articles_failed > 0 || summary.logging_failures > 0;
  summary.status = hasFailure ? summary.articles_inserted === 0 && summary.sources.every(source => source.outcome === "failed") ? "failed" : "partial" : "completed";
  summary.duration_ms = Date.now() - start;
  await log("finished");
  if (summary.logging_failures && summary.status === "completed") summary.status = "partial";
  console.info("[scrape] finished", summary);
  return summary;
}
