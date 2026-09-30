import assert from "node:assert/strict";
import { test } from "node:test";
import { APICallError } from "ai";
import { POST } from "../app/api/analyze/route";
import { analyzeArticle, safeAnalysisError } from "../lib/ai/analyze-article";
import { embeddingInput, generateArticleEmbedding } from "../lib/ai/embed-article";
import { AnalysisError, toStoredAnalysis } from "../lib/ai/analysis-schema";
import { analysisBatchSize, readAnalysisOptions, runAnalysis, type AnalysisDependencies } from "../lib/pipeline/analyze";
import type { Article, ArticleAnalysis, Log, NewLog, PendingArticle } from "../lib/supabase/types";
import { withinBudget } from "../lib/pipeline/budget";

const id = (n: number) => `12345678-1234-4234-8234-${String(n).padStart(12, "0")}`;
const article = (n: number): Article => ({ id: id(n), source_id: id(99), original_url: "https://example.com/story", canonical_url: "https://example.com/story", title: "A substantive article headline", image_url: "https://example.com/photo.jpg", published_at: "2026-09-23T12:00:00Z", scraped_at: "2026-09-24T12:00:00Z", analyzed_at: null, raw_text: "An evidence-based statement describes the policy and its effects. ".repeat(30) });
const output = { summary: "A neutral account of the policy.", sentimentScore: 0, sentimentLabel: "neutral", politicalFramingLabel: "center", leftPercentage: 15, centerPercentage: 70, rightPercentage: 15, confidence: 0.8, framingNotes: ["The account presents policy effects without partisan claims."], loadedTerms: [] };
const stored = toStoredAnalysis(output, article(1).raw_text, "test-model");
const embedding = Array.from({ length: 1536 }, () => 0.01);
function harness(rows: Article[]) {
  const saved = new Set<string>();
  const attempted = new Map<string, string>();
  const cooling = new Set<string>();
  const logs: NewLog[] = [];
  const pendingRows: PendingArticle[] = rows.map(row => ({ ...row, needs_analysis: true, analysis_summary: null }));
  const deps: AnalysisDependencies = {
    configure: () => {},
    pending: async ({ limit = 5, runId, articleIds }) => pendingRows.filter(row => !saved.has(row.id) && attempted.get(row.id) !== runId && !cooling.has(row.id) && (!articleIds || articleIds.includes(row.id))).slice(0, limit),
    claim: async (articleId, runId) => { attempted.set(articleId, runId); return id(500); },
    finish: async (articleId, _token, code) => { if (code) cooling.add(articleId); },
    analyze: async () => stored,
    embed: async () => embedding,
    save: async (articleId, analysis, vector) => { saved.add(articleId); return { ...analysis, id: id(200), article_id: articleId, embedding: vector, created_at: "2026-09-24T12:00:00Z", bias_score: 0 } as ArticleAnalysis; },
    saveEmbedding: async (articleId, vector) => { saved.add(articleId); return { ...stored, id: id(200), article_id: articleId, embedding: vector, created_at: "2026-09-24T12:00:00Z", bias_score: 0 } as ArticleAnalysis; },
    log: async input => { logs.push(input); return { ...input, id: id(300) } as Log; },
  };
  return { deps, saved, logs, cooling };
}

test("output gates enforce framing, sentiment, scores and evidence", () => {
  for (const invalid of [
    { ...output, centerPercentage: 69 }, { ...output, confidence: Number.NaN },
    { ...output, politicalFramingLabel: "left" }, { ...output, confidence: 0.2 },
    { ...output, sentimentScore: -0.9 }, { ...output, loadedTerms: ["invented quotation"] },
    { ...output, framingNotes: [] }, { ...output, summary: " " },
  ]) assert.throws(() => toStoredAnalysis(invalid, article(1).raw_text, "test"));
  assert.equal(toStoredAnalysis({ ...output, confidence: 0.2, politicalFramingLabel: "unclear" }, "", "test").bias_label, "unclear");
  assert.equal(toStoredAnalysis({ ...output, leftPercentage: 35, centerPercentage: 35, rightPercentage: 30, politicalFramingLabel: "mixed" }, "", "test").bias_label, "mixed");
});

test("embedding-only backfill preserves analysis and skips text generation", async () => {
  const h = harness([article(1)]);
  h.deps.pending = async () => [{ ...article(1), needs_analysis: false, analysis_summary: stored.summary }];
  let analysisCalls = 0;
  let backfillCalls = 0;
  h.deps.analyze = async () => { analysisCalls++; return stored; };
  h.deps.saveEmbedding = async (articleId, vector) => {
    backfillCalls++;
    h.saved.add(articleId);
    return { ...stored, id: id(200), article_id: articleId, embedding: vector, created_at: "2026-09-24T12:00:00Z", bias_score: 0 } as ArticleAnalysis;
  };
  const result = await runAnalysis({ limit: 1 }, h.deps);
  assert.equal(analysisCalls, 0);
  assert.equal(backfillCalls, 1);
  assert.equal(result.analysis_generated, 0);
  assert.equal(result.embeddings_backfilled, 1);
  assert.equal(result.embeddings_saved, 1);
});

test("embedding generation uses title and validated summary with exact dimensions", async () => {
  const value = embeddingInput(article(1), stored.summary);
  assert.equal(value, `${article(1).title}\n\n${stored.summary}`);
  assert.deepEqual(await generateArticleEmbedding(article(1), stored.summary, async input => {
    assert.equal(input, value);
    return embedding;
  }), embedding);
  await assert.rejects(generateArticleEmbedding(article(1), stored.summary, async () => [0.1]));
});

test("invalid output retries once; invalid input and transport failures do not retry", async () => {
  let calls = 0;
  await analyzeArticle(article(1), async (_a, retry) => { calls++; assert.equal(retry, calls === 2); return { output: calls === 1 ? {} : output, model: "test" }; });
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(analyzeArticle(article(1), async () => { calls++; return { output: {}, model: "test" }; }));
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(analyzeArticle({ ...article(1), raw_text: "x" }, async () => { calls++; throw new Error(); }));
  await assert.rejects(analyzeArticle({ ...article(1), raw_text: "x".repeat(60_001) }, async () => { calls++; throw new Error(); }));
  assert.equal(calls, 0);
  await assert.rejects(analyzeArticle(article(1), async () => { calls++; throw new AnalysisError("provider_timeout"); }));
  assert.equal(calls, 1);
  assert.equal(safeAnalysisError(new APICallError({ message: "private payload", url: "https://example.com", requestBodyValues: {}, statusCode: 429 })).fatal, true);
});

test("full runs cross batches; failed rows enter cooldown and remain retryable", async () => {
  const h = harness(Array.from({ length: 12 }, (_, i) => article(i + 1)));
  h.deps.analyze = async row => { if (row.id === id(2)) throw new AnalysisError("invalid_output"); return stored; };
  const result = await runAnalysis({}, h.deps);
  assert.equal(result.attempted, 12); assert.equal(result.analyzed, 11); assert.equal(result.failed, 1);
  assert.equal(result.batches, 3); assert.equal(result.status, "partial");
  const second = await runAnalysis({}, h.deps);
  assert.equal(second.attempted, 0);
  h.cooling.clear();
  assert.equal((await runAnalysis({}, h.deps)).failed, 1);
});

test("selection, limit, existing timestamp, empty runs and save failures", async () => {
  const rows = [article(1), { ...article(2), analyzed_at: "2026-09-24T13:00:00Z" }, article(3)];
  const h = harness(rows);
  const selected = await runAnalysis({ articleIds: [id(2), id(3)], limit: 1 }, h.deps);
  assert.equal(selected.analyzed, 1); assert.equal(selected.stop_reason, "limit_reached"); assert.ok(h.saved.has(id(2)));
  assert.equal((await runAnalysis({ articleIds: [id(2)] }, h.deps)).attempted, 0);
  h.deps.save = async () => { throw new Error("private database details"); };
  const failed = await runAnalysis({}, h.deps);
  assert.equal(failed.analyzed, 0); assert.equal(failed.failed, 2); assert.equal(h.saved.size, 1);
  assert.ok(!JSON.stringify(h.logs).includes("private database details"));
});

test("fatal provider errors stop calls; logging failure preserves successful saves", async () => {
  const h = harness([article(1), article(2)]);
  h.deps.analyze = async () => { throw new AnalysisError("provider_access_or_quota", true); };
  const fatal = await runAnalysis({}, h.deps);
  assert.equal(fatal.attempted, 1); assert.equal(fatal.status, "failed");
  h.cooling.clear();
  h.deps.analyze = async () => stored;
  h.deps.log = async () => { throw new Error("private logging error"); };
  const result = await runAnalysis({}, h.deps);
  assert.equal(result.analyzed, 2); assert.ok(result.logging_failures > 0); assert.equal(result.status, "partial");
});

test("route authorizes before work and validates bounded options", async () => {
  const original = process.env.BIASLY_ADMIN_SECRET;
  process.env.BIASLY_ADMIN_SECRET = "test-secret";
  try {
    const response = await POST(new Request("http://localhost/api/analyze", { method: "POST", body: "{}" }));
    assert.equal(response.status, 401);
    for (const body of ['{"limit":0}', '{"articleIds":[]}', '{"extra":1}', '{']) {
      const bad = await POST(new Request("http://localhost/api/analyze", { method: "POST", headers: { "x-biasly-admin-secret": "test-secret" }, body }));
      assert.equal(bad.status, 400);
    }
    const oversized = await POST(new Request("http://localhost/api/analyze", { method: "POST", headers: { "x-biasly-admin-secret": "test-secret" }, body: "x".repeat(9000) }));
    assert.equal(oversized.status, 413);
    assert.deepEqual(await readAnalysisOptions(new Request("http://localhost", { method: "POST" })), {});
  } finally { if (original === undefined) delete process.env.BIASLY_ADMIN_SECRET; else process.env.BIASLY_ADMIN_SECRET = original; }
});

test("batch configuration is bounded", () => {
  const original = process.env.ANALYSIS_BATCH_SIZE;
  try {
    for (const value of ["0", "101", "five", "", "1.5"]) { process.env.ANALYSIS_BATCH_SIZE = value; assert.throws(analysisBatchSize); }
    delete process.env.ANALYSIS_BATCH_SIZE; assert.equal(analysisBatchSize(), 5);
  } finally { if (original === undefined) delete process.env.ANALYSIS_BATCH_SIZE; else process.env.ANALYSIS_BATCH_SIZE = original; }
});

test("deadline persists retry state before stopping and leaves later articles untouched", async t => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const h = harness([article(1), article(2)]);
  h.deps.analyze = async () => { now += 60_001; throw new AnalysisError("provider_timeout"); };
  const result = await withinBudget(now + 60_000, () => runAnalysis({}, h.deps));
  assert.equal(result.stop_reason, "deadline");
  assert.equal(result.attempted, 1);
  assert.ok(h.cooling.has(id(1)));
  assert.ok(!h.cooling.has(id(2)));
});

test("validation retry carries safe, actionable feedback without the unsupported quotation", async () => {
  let feedbackSeen = "";
  const result = await analyzeArticle(article(1), async (_article, retry, _context, feedback) => {
    if (retry) feedbackSeen = feedback ?? "";
    return { output: retry ? output : { ...output, loadedTerms: ["private invented quotation"] }, model: "test" };
  });
  assert.ok(feedbackSeen.includes("exact substring"));
  assert.ok(!feedbackSeen.includes("private invented"));
  assert.deepEqual(result.loaded_terms, []);
});
