import assert from "node:assert/strict";
import { getActiveSources } from "../lib/supabase/queries/sources";
import { getArticleById, getPendingArticles, getPublishedArticles, getRelatedArticles } from "../lib/supabase/queries/articles";
import { getLogs } from "../lib/supabase/queries/logs";
import { getScheduleRuns, getSchedules } from "../lib/supabase/queries/schedules";
import { checkError, DataAccessError } from "../lib/supabase/validation";
import { getSupabaseAdmin } from "../lib/supabase/server";

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase public URL and anon key must be configured.");
  console.log(`Read-only verification: ${new URL(url).hostname}`);
  const sources = await getActiveSources({ limit: 10 });
  const { error: embeddingColumnError } = await getSupabaseAdmin().from("article_analyses").select("embedding").limit(1);
  checkError(embeddingColumnError, "verify embedding column");
  const rpcProbe = await getRelatedArticles("00000000-0000-0000-0000-000000000000", Array.from({ length: 1536 }, () => 0.01));
  assert.ok(rpcProbe.length <= 5);
  assert.ok(sources.every(source => source.active));
  assert.deepEqual(await getActiveSources({ ids: [] }), []);
  const published = await getPublishedArticles({ limit: 2 });
  for (const article of published) {
    assert.ok(article.source && article.analysis);
    assert.ok(!("raw_text" in article));
    const details = await getArticleById(article.id);
    assert.equal(details?.id, article.id);
    if (details?.analysis.embedding) {
      const related = await getRelatedArticles(article.id, details.analysis.embedding);
      assert.ok(related.length <= 5 && related.every(row => row.id !== article.id));
    }
  }
  assert.equal(await getArticleById("00000000-0000-0000-0000-000000000000"), null);
  assert.deepEqual(await getPendingArticles({ articleIds: [] }), []);
  const pending = await getPendingArticles({ limit: 2 });
  const last = pending.at(-1);
  if (last) {
    const next = await getPendingArticles({ limit: 2, after: { id: last.id, scraped_at: last.scraped_at } });
    assert.ok(next.every(row => !pending.some(previous => row.id === previous.id)));
  }
  await getLogs({ limit: 1 });
  const schedules = await getSchedules({ limit: 2 });
  for (const schedule of schedules) {
    assert.equal(typeof schedule.schedule_id, "string");
    const runs = await getScheduleRuns(schedule.id, { limit: 2 });
    assert.ok(runs.every(run => typeof run.job_id === "string" && typeof run.external_run_id === "string"));
  }
  for (const table of ["sources", "articles", "article_analyses", "logs", "oxylabs_schedules", "oxylabs_schedule_runs"]) {
    const response = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` }, signal: AbortSignal.timeout(15_000),
    });
    assert.ok([401, 403].includes(response.status), `Anonymous ${table} read should be denied; received ${response.status}`);
  }
  console.log(`PASS: active sources (${sources.length}), published articles (${published.length}), pending analysis/embedding page (${pending.length}), related lookup, logs, schedules, and anonymous read denial.`);
  console.log("No rows written. Run supabase/verify.sql in SQL Editor for transactional write/permission checks.");
}

main().catch(error => {
  if (error instanceof DataAccessError) console.error(`FAIL: ${error.message} Code: ${error.code}`);
  else console.error("FAIL: verification could not complete. Check credentials, schema setup, network access, and SQL verification results.");
  process.exitCode = 1;
});
