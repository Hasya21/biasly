import assert from "node:assert/strict";
import { test } from "node:test";
import { findExistingArticleUrls, getArticleById, getPendingArticles, getPublishedArticles, getPublishedArticleIdentity, getRelatedArticles, insertArticle } from "../lib/supabase/queries/articles";
import { safeArticleUrl, toNewsCard, toNewsDetails } from "../lib/news/presentation";
import { saveArticleAnalysis } from "../lib/supabase/queries/analyses";
import { claimScheduleRun } from "../lib/supabase/queries/schedules";
import { safeContext } from "../lib/supabase/queries/logs";
import { DataAccessError, externalId, httpUrl, validateAnalysis, validateArticle } from "../lib/supabase/validation";
import type { ArticleDetails, NewAnalysis, NewArticle } from "../lib/supabase/types";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://database-test.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-key";
const id = "12345678-1234-1234-1234-123456789012";
const article: NewArticle = { source_id: id, original_url: "https://news.invalid/story?edition=us", canonical_url: "https://news.invalid/story", title: "Article title", image_url: "https://news.invalid/image.jpg", published_at: "2026-09-16T12:00:00Z", raw_text: "A meaningful sentence in a cleaned article. ".repeat(30) };
const analysis: NewAnalysis = { summary: "Neutral summary", sentiment_score: 0, sentiment_label: "neutral", bias_label: "center", left_percentage: 20, center_percentage: 50, right_percentage: 30, confidence: 0.7, framing_notes: [], loaded_terms: [], disclaimer: "AI-estimated", model: "test" };
const embedding = Array.from({ length: 1536 }, () => 0.01);

test("input gates reject malformed articles and model output without rewriting meaningful URLs", () => {
  assert.equal(httpUrl("https://NEWS.invalid/story?edition=us#comments"), "https://news.invalid/story?edition=us");
  assert.throws(() => validateArticle({ ...article, image_url: "" }));
  assert.throws(() => validateArticle({ ...article, raw_text: "a\n\nb\n\nc" }));
  assert.throws(() => validateArticle({ ...article, published_at: "invalid" }));
  assert.throws(() => validateAnalysis({ ...analysis, confidence: Number.NaN }));
  assert.throws(() => validateAnalysis({ ...analysis, center_percentage: 51 }));
  assert.throws(() => externalId(9223372036854775807 as unknown as string));
  assert.equal(externalId("9223372036854775807"), "9223372036854775807");
  assert.deepEqual(safeContext({ articles_inserted: 2, authorization: "secret", error: { token: "secret" } }), { articles_inserted: 2 });
});

test("data access preserves chunk bounds, errors, RPC atomicity, claims, and cursor selection", async () => {
  const originalFetch = globalThis.fetch;
  const requests: { url: URL; init?: RequestInit }[] = [];
  let respond: (url: URL, init?: RequestInit) => Response = () => Response.json([]);
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    assert.equal(url.hostname, "database-test.invalid", "Tests must never contact a real project");
    requests.push({ url, init });
    return respond(url, init);
  };
  try {
    const urls = Array.from({ length: 32 }, (_, index) => `https://news.invalid/story-${index}`);
    respond = url => {
      const filter = url.searchParams.get("original_url") ?? url.searchParams.get("canonical_url");
      assert.ok(filter);
      assert.ok(filter.slice(4, -1).split(",").length <= 15);
      return Response.json(filter.includes("story-0") ? [{ original_url: urls[0], canonical_url: "https://news.invalid/canonical" }] : []);
    };
    assert.deepEqual(await findExistingArticleUrls(urls), new Set([urls[0]]));
    assert.equal(requests.length, 6);

    respond = () => Response.json({ code: "23505", message: "private details" }, { status: 409 });
    assert.deepEqual(await insertArticle(article), { status: "duplicate" });
    respond = () => Response.json({ code: "42501", message: "secret provider details" }, { status: 403 });
    await assert.rejects(getPublishedArticles(), (error: unknown) => error instanceof DataAccessError && error.code === "42501" && !error.message.includes("secret"));

    respond = () => Response.json(null);
    assert.equal(await getArticleById(id), null);
    respond = url => {
      assert.equal(url.searchParams.get("select"), "id,title,article_analyses!inner(id)");
      assert.equal(url.searchParams.get("analyzed_at"), "not.is.null");
      return Response.json({ id, title: "Public title", article_analyses: { id } });
    };
    assert.deepEqual(await getPublishedArticleIdentity(id), { id, title: "Public title" });
    respond = url => {
      assert.ok(!url.searchParams.get("select")?.includes("raw_text"));
      assert.ok(url.searchParams.get("select")?.includes("!inner"));
      assert.equal(url.searchParams.get("analyzed_at"), "not.is.null");
      return Response.json([]);
    };
    assert.deepEqual(await getPublishedArticles(), []);

    respond = (url, init) => {
      assert.equal(url.pathname, "/rest/v1/rpc/get_pending_articles");
      assert.deepEqual(JSON.parse(String(init?.body)), { p_limit: 5, p_after_scraped_at: article.published_at, p_after_id: id, p_article_ids: [id] });
      return Response.json([]);
    };
    await getPendingArticles({ after: { id, scraped_at: article.published_at }, articleIds: [id] });
    const beforeSave = requests.length;
    respond = (url, init) => {
      assert.equal(url.pathname, "/rest/v1/rpc/save_article_analysis");
      assert.equal(JSON.parse(String(init?.body)).p_article_id, id);
      assert.equal(JSON.parse(String(init?.body)).p_embedding.length, 1536);
      return Response.json({ ...analysis, article_id: id, id, embedding, bias_score: 0.1, created_at: article.published_at });
    };
    assert.equal((await saveArticleAnalysis(id, analysis, embedding)).bias_score, 0.1);
    assert.equal(requests.length - beforeSave, 1, "Analysis and timestamp must use one atomic RPC");
    respond = (url, init) => {
      assert.equal(url.pathname, "/rest/v1/rpc/match_related_articles");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_article_id, id); assert.equal(body.p_limit, 5); assert.equal(body.p_query_embedding.length, 1536);
      return Response.json([{ id: "12345678-1234-1234-1234-123456789013", title: "Related", image_url: article.image_url, published_at: article.published_at, source_name: "Publisher" }]);
    };
    assert.equal((await getRelatedArticles(id, embedding))[0]?.title, "Related");
    respond = (_url, init) => {
      assert.equal(JSON.parse(String(init?.body)).job_id, "9223372036854775807");
      return Response.json({ code: "23505", message: "already claimed" }, { status: 409 });
    };
    assert.equal(await claimScheduleRun({ schedule_id: id, external_run_id: "9223372036854775806", job_id: "9223372036854775807" }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("stored news mapping preserves saved analysis and excludes private content from cards", () => {
  const row: ArticleDetails = {
    id, title: "[DEMO] A stored article", image_url: "https://news.invalid/photo.jpg",
    original_url: article.original_url, canonical_url: article.canonical_url, published_at: article.published_at,
    raw_text: "First paragraph.\n\nSecond paragraph.",
    source: { id, name: "Stored publisher", listing_url: "https://news.invalid", logo_url: null },
    analysis: { ...analysis, id, article_id: id, embedding: null, bias_score: 0.1, created_at: article.published_at, model: "manual-demo-fixture" },
  };
  const card = toNewsCard(row);
  assert.equal(card.id, id);
  assert.equal(card.source, "Stored publisher");
  assert.equal(card.publishedLabel, "Sep 16, 2026");
  assert.equal(card.isDemo, true);
  assert.ok(!("raw_text" in card) && !("summary" in card) && !("sourceCount" in card));
  const details = toNewsDetails(row);
  assert.deepEqual(details.paragraphs, ["First paragraph.", "Second paragraph."]);
  assert.equal(details.summary, analysis.summary);
  assert.equal(details.disclaimer, analysis.disclaimer);
  assert.deepEqual(details.framingNotes, analysis.framing_notes);
  assert.ok(!("embedding" in details));
  for (const unsafe of ["javascript:alert(1)", "data:text/html,test", "https://user:secret@news.invalid", "not a URL"]) {
    assert.equal(safeArticleUrl(unsafe), undefined);
  }
  assert.equal(toNewsCard({ ...row, analysis: { ...row.analysis, model: "real-analysis-model" } }).isDemo, false);
});
