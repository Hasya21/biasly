import assert from "node:assert/strict";
import { test } from "node:test";
import { requireAdmin } from "../lib/api/admin";
import { articleUrl, publicUrl } from "../lib/parsing/urls";
import { extractCandidates, parseArticle } from "../lib/parsing/articles";
import { readScrapeOptions, runScrape, type ScrapeDependencies } from "../lib/pipeline/scrape";
import { fetchPage, ScrapeError } from "../lib/scraping/oxylabs";
import type { Source, Log } from "../lib/supabase/types";

const bbc: Source = { id: "85c78a73-82be-4abd-bb2b-a9b2b1ec47e9", name: "BBC News", listing_url: "https://www.bbc.com/news", parser_strategy: null, active: true, logo_url: null, created_at: "", updated_at: "" };
const guardian: Source = { ...bbc, id: "8de88c16-04f5-4778-9c43-94ccb176f3ec", name: "The Guardian", listing_url: "https://www.theguardian.com/international" };
const url = "https://www.bbc.com/news/articles/c1234567890o";
const guardianUrl = "https://www.theguardian.com/world/2026/sep/20/council-announces-new-transport-project";
const paragraph = "The council announced a new transport project after residents discussed the proposals at a public meeting. Officials said construction would begin after the final review. ";

const additions = [
  { strategy: "npr", entry: "https://www.npr.org/sections/news/", url: "https://www.npr.org/2026/09/24/g-s1-144835/openai-breach-australia", card: '<article><h2 class="title"><a href="URL">A specific news headline</a></h2></article>', root: '<div id="storytext">BODY</div>', body: `<p>${paragraph.repeat(7)}</p>` },
  { strategy: "reuters", entry: "https://www.reuters.com/", url: "https://www.reuters.com/world/china/diplomatic-split-screen-trump-xi-meet-2026-09-24/", card: '<a data-testid="TitleLink" href="URL">A specific news headline</a>', root: '<div class="article-body-module__content__example">BODY</div>', body: `<div data-testid="paragraph-0">${paragraph.repeat(7)}</div>` },
  { strategy: "ap", entry: "https://apnews.com/", url: "https://apnews.com/article/trump-xi-arrival-washington-state-visit-baea8dbdb8c832ae1b295579709dc967", card: '<div class="PagePromo"><h3 class="PagePromo-title"><a href="URL">A specific news headline</a></h3></div>', root: '<div class="RichTextStoryBody RichTextBody">BODY</div>', body: `<p>${paragraph.repeat(7)}</p>` },
];
test("new source strategies extract observed card/body structures and reject non-articles", () => {
  for (const example of additions) {
    const source = { ...bbc, listing_url: example.entry, parser_strategy: example.strategy };
    assert.equal(articleUrl(example.url, source), example.url);
    assert.equal(articleUrl(example.entry, source), null);
    assert.equal(articleUrl(example.url.replace(new URL(example.url).hostname, "evil.example"), source), null);
    const card = example.card.replace("URL", example.url);
    assert.deepEqual(extractCandidates(`<nav>${card}</nav>${card}<div hidden>${card}</div>`, source).urls, [example.url]);
    const body = example.root.replace("BODY", example.body + '<div class="caption"><p>Unrelated photograph caption that must never become article text.</p></div>');
    const html = `<h1>Council announces transport project following public review</h1><meta property="article:published_time" content="2026-09-20T10:00:00Z"><meta property="og:image" content="https://images.example.com/photo.jpg">${body}`;
    const parsed = parseArticle(html, example.url, example.url, source);
    assert.ok("article" in parsed, example.strategy);
    assert.ok(!parsed.article.raw_text.includes("photograph caption"));
    for (const invalid of [html.replace('property="og:image"', 'property="irrelevant"'), html.replace('property="article:published_time"', 'property="irrelevant"'), html.replace(example.body, "<p>Access denied. Subscribe to continue.</p>"), html.replace(example.body, `<p>${"window.private = {}; ".repeat(100)}</p>`)]) assert.ok("reason" in parseArticle(invalid, example.url, example.url, source));
  }
  const npr = { ...bbc, listing_url: additions[0].entry, parser_strategy: "npr" };
  assert.ok(articleUrl("https://www.npr.org/sections/health-shots/2026/09/24/nx-s1-1234567/health-policy-review", npr));
  for (const path of ["/sections/health-shots/", "/podcasts/510355/considerthis", "/2026/09/24/not-a-story"]) assert.equal(articleUrl(path, npr), null);
  assert.deepEqual(extractCandidates(`<article><a href="/podcasts/510355/considerthis">Podcast</a><h2 class="title"><a href="${additions[0].url}">Episode headline</a></h2></article>`, npr).urls, []);
  const reuters = { ...bbc, listing_url: additions[1].entry, parser_strategy: "reuters" };
  for (const path of ["/world/africa/", "/markets/", "/pictures/photos-news-today-2026-09-24/", "/world/live/story-news-today-2026-09-24/"]) assert.equal(articleUrl(path, reuters), null);
  const ap = { ...bbc, listing_url: additions[2].entry, parser_strategy: "ap" };
  for (const path of ["/hub/politics", "/live/news-updates", "/press-release/example", "/article/a-short-id"]) assert.equal(articleUrl(path, ap), null);
});
function article(source = bbc, opts: { date?: boolean; image?: boolean; body?: string; canonical?: string } = {}) {
  return `<html><head>${opts.image === false ? "" : '<meta property="og:image" content="https://images.example.com/news.jpg">'}${opts.date === false ? "" : '<meta property="article:published_time" content="2026-09-20T10:00:00Z">'}${opts.canonical ? `<link rel="canonical" href="${opts.canonical}">` : ""}</head><body><h1>Council announces new transport project after public review</h1><article><div ${source === bbc ? 'data-component="text-block"' : 'data-gu-name="body"'}>${opts.body ?? `<p>${paragraph.repeat(7)}</p>`}<div class="related"><p>Read more unrelated stories here.</p></div></div></article></body></html>`;
}
function homepage(urls: string[]) { return urls.map((url, i) => `<a href="${url}"><h2>Story headline number ${i}</h2></a>`).join(""); }

test("publisher boundaries, tracking normalization and non-article URL gates", () => {
  assert.equal(articleUrl(url + "?utm_source=test&edition=us#comments", bbc), url + "?edition=us");
  assert.equal(articleUrl(guardianUrl, guardian), guardianUrl);
  for (const invalid of ["/news", "/sport/articles/c1234567890o", "/news/live/c1234567890o", "https://evil.example/news/articles/c1234567890o", "/news/topics/c1234567890o"]) assert.equal(articleUrl(invalid, bbc), null);
  for (const invalid of ["/world", "/world/live/2026/sep/20/story-news-today", "/thefilter/2026/sep/20/best-products-to-buy"]) assert.equal(articleUrl(invalid, guardian), null);
  for (const unsafe of ["http://127.0.0.1/a", "http://169.254.169.254/a", "http://[::1]/a", "http://service.internal/a", "https://user:pass@example.com/a", "file:///tmp/a"]) assert.throws(() => publicUrl(unsafe));
});

test("homepage extraction excludes navigation, hidden and non-story links", () => {
  const candidates = extractCandidates(`<nav>${homepage([url])}</nav><div hidden>${homepage([url])}</div>${homepage([url, url, "/news/live/test"])}<a href="${url}">Footer utility</a>`, bbc);
  assert.deepEqual(candidates, { urls: [url], found: 3, rejected: 1, duplicates: 1 });
  assert.deepEqual(extractCandidates(homepage([guardianUrl]), guardian).urls, [guardianUrl]);
});

test("detail validation accepts long single blocks and rejects missing metadata, listings and noise", () => {
  for (const source of [bbc, guardian]) {
    const target = source === bbc ? url : guardianUrl;
    const parsed = parseArticle(article(source), target, target, source);
    assert.ok("article" in parsed);
    assert.ok(parsed.article.raw_text.includes("\n\n"));
    assert.ok(!parsed.article.raw_text.includes("Read more"));
  }
  for (const options of [{ date: false }, { image: false }, { canonical: "/news" }, { body: "<p>Short content.</p>" }, { body: `<p>${"window.secret = {}; ".repeat(100)}</p>` }]) assert.ok("reason" in parseArticle(article(bbc, options), url, url, bbc));
  assert.ok("reason" in parseArticle(article(), url, "https://evil.example/news/articles/c1234567890o", bbc));
});

test("authorization and strict bounded options fail before pipeline access", async () => {
  process.env.BIASLY_ADMIN_SECRET = "test-secret";
  assert.throws(() => requireAdmin(new Request("http://localhost/api/scrape")));
  assert.throws(() => requireAdmin(new Request("http://localhost/api/scrape", { headers: { "x-biasly-admin-secret": "wrong" } })));
  requireAdmin(new Request("http://localhost/api/scrape", { headers: { "x-biasly-admin-secret": "test-secret" } }));
  const request = (body: string) => new Request("http://localhost/api/scrape", { method: "POST", body });
  assert.equal((await readScrapeOptions(request(""))).limitPerSource, 5);
  for (const body of ['{"limitPerSource":0}', '{"sourceIds":[]}', '{"url":"https://example.com"}', "{", " ".repeat(9000)]) await assert.rejects(readScrapeOptions(request(body)));
});

test("pipeline continues after rejected/duplicate articles and source failures, respecting inserted limit", async () => {
  const urls = [url, url.replace("7890o", "7891o"), url.replace("7890o", "7892o"), url.replace("7890o", "7893o")];
  const inserted: string[] = [];
  const dependencies: ScrapeDependencies = {
    sources: async () => [guardian, bbc],
    fetch: async target => {
      if (target === guardian.listing_url) throw new ScrapeError("provider_timeout");
      return { url: target, html: target === bbc.listing_url ? homepage(urls) : article(bbc, target === urls[1] ? { image: false } : {}) };
    },
    existing: async targets => new Set(targets.includes(url) ? [url] : []),
    insert: async input => { inserted.push(input.original_url); return { status: "inserted", article: { ...input, id: "test", analyzed_at: null, scraped_at: "" } }; },
    log: async input => ({ ...input, id: "test" } as Log),
  };
  const result = await runScrape({ limitPerSource: 1 }, dependencies);
  assert.equal(result.status, "partial");
  assert.equal(result.duplicates_skipped, 1);
  assert.equal(result.articles_rejected, 1);
  assert.equal(result.articles_inserted, 1);
  assert.equal(result.detail_pages_scraped, 2);
  assert.deepEqual(inserted, [urls[2]]);
  assert.equal(result.sources[1].outcome, "limit_reached");
  await assert.rejects(runScrape({ limitPerSource: 1, sourceIds: ["unknown"] }, dependencies));
});

test("canonical collisions skip inserts; fatal credentials stop provider work; logging errors surface", async () => {
  let calls = 0;
  const dependencies: ScrapeDependencies = {
    sources: async () => [bbc, guardian],
    fetch: async target => { calls++; if (target === guardian.listing_url) throw new ScrapeError("provider_auth", true); return { url: target, html: target === bbc.listing_url ? homepage([url]) : article(bbc, { canonical: url.replace("7890o", "7899o") }) }; },
    existing: async targets => new Set(targets.length === 2 ? [targets[1]] : []),
    insert: async () => { throw new Error("Must not insert canonical duplicate"); },
    log: async () => { throw new Error("private error"); },
  };
  const result = await runScrape({ limitPerSource: 5 }, dependencies);
  assert.equal(result.duplicates_skipped, 1);
  assert.equal(result.articles_inserted, 0);
  assert.ok(result.logging_failures > 0);
  assert.equal(calls, 3);
});

test("provider validates status/content, retries transient failures and sanitizes errors", async () => {
  process.env.OXY_WSA_USERNAME = "test"; process.env.OXY_WSA_PASSWORD = "secret";
  let calls = 0;
  const transport: typeof fetch = async () => ++calls === 1 ? new Response("private", { status: 503 }) : Response.json({ results: [{ status_code: 200, content: "<html>content</html>", url }] });
  assert.equal((await fetchPage(url, transport)).url, url);
  assert.equal(calls, 2);
  await assert.rejects(fetchPage(url, async () => new Response("secret", { status: 401 })), (error: unknown) => error instanceof ScrapeError && error.fatal && error.message === "provider_auth");
  await assert.rejects(fetchPage(url, async () => Response.json({ results: [{ status_code: 404, content: "missing", url }] })));
  await assert.rejects(fetchPage(url, async () => { throw new DOMException("private", "TimeoutError"); }), (error: unknown) => error instanceof ScrapeError && error.code === "provider_timeout");
});
