/** Explicit live verification: performs one paid default scrape and append-only inserts. */
import { getSupabaseAdmin } from "../lib/supabase/server";
import { findExistingArticleUrls } from "../lib/supabase/queries/articles";

async function main() {
  const secret = process.env.BIASLY_ADMIN_SECRET;
  if (!secret) throw new Error("Configure the admin secret first.");
  const base = "http://localhost:3000";
  const headers = { "x-biasly-admin-secret": secret, "Content-Type": "application/json" };
  const sources = await fetch(`${base}/api/sources`);
  console.log("sources", sources.status, await sources.json());
  for (const [label, request] of [
    ["unauthorized", fetch(`${base}/api/scrape`, { method: "POST", body: "{}" })],
    ["wrong_method", fetch(`${base}/api/scrape`)],
    ["invalid_limit", fetch(`${base}/api/scrape`, { method: "POST", headers, body: '{"limitPerSource":0}' })],
    ["private_logs", fetch(`${base}/api/logs`)],
  ] as const) {
    const response = await request;
    console.log(label, response.status);
    const expected = label === "wrong_method" ? 405 : label === "invalid_limit" ? 400 : 401;
    if (response.status !== expected) throw new Error(`Unexpected ${label} response.`);
  }
  const start = new Date().toISOString();
  // Optional explicit UUID arguments select only those active sources.
  const sourceIds = process.argv.slice(2);
  const response = await fetch(`${base}/api/scrape`, { method: "POST", headers, body: JSON.stringify(sourceIds.length ? { sourceIds, limitPerSource: 5 } : {}), signal: AbortSignal.timeout(1_200_000) });
  const summary = await response.json();
  console.log("LIVE_RESULT", response.status, JSON.stringify(summary, null, 2));
  const logs = await fetch(`${base}/api/logs?limit=20&runId=${encodeURIComponent(summary.run_id ?? "")}`, { headers });
  console.log("LOGS", logs.status, await logs.json());
  if (response.status !== 200 || summary.status !== "completed") process.exitCode = 1;
  if (!summary.articles_inserted) return;
  const db = getSupabaseAdmin();
  let query = db.from("articles").select("id,source_id,title,original_url,canonical_url,image_url,published_at,raw_text,analyzed_at").gte("scraped_at", start);
  if (sourceIds.length) query = query.in("source_id", sourceIds);
  const { data, error } = await query;
  if (error) throw new Error("Verification database read failed.");
  for (const row of data ?? []) console.log("SAVED", { ...row, raw_text: undefined, body_length: row.raw_text.length, preview: row.raw_text.slice(0, 500), ending: row.raw_text.slice(-250), duplicate_detected: (await findExistingArticleUrls([row.original_url, row.canonical_url])).size > 0 });
}
main().catch(() => { console.error("Live verification failed; inspect safe output and server logs."); process.exitCode = 1; });
