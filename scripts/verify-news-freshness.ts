import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "../lib/supabase/server";
import { getAnalysisCandidates } from "../lib/supabase/queries/analysis-work";
import { getArticleById } from "../lib/supabase/queries/articles";
import { runAnalysis } from "../lib/pipeline/analyze";
import { withPipelineLease } from "../lib/pipeline/lease";
import { withinRequestBudget } from "../lib/pipeline/budget";

async function main() {
  const db = getSupabaseAdmin();
  const schedules = await db.from("oxylabs_schedules").select("id,last_attempted_at");
  assert.equal(schedules.error, null, "Source progress column must exist");
  const pending = await getAnalysisCandidates({ runId: randomUUID(), limit: 100 });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15_000) }) },
  });
  assert.ok((await anon.rpc("get_analysis_candidates", { p_run_id: randomUUID() })).error, "Anonymous queue access must be denied");
  assert.ok((await anon.from("article_analysis_work").select("article_id").limit(1)).error, "Anonymous work table access must be denied");
  console.info("PASS: live migration, pending selection, and anonymous denial", { eligible_up_to_100: pending.length });
  if (!process.argv.includes("--recover")) return;
  const article = [...pending].sort((a, b) => Date.parse(b.scraped_at) - Date.parse(a.scraped_at))[0];
  if (!article) { console.info("No eligible pending article to recover."); return; }
  await withinRequestBudget(Date.now() + 270_000, () => withPipelineLease("hourly_pipeline", async () => {
    // A single paid recovery attempt, using the same claim, validation and save path as Cron.
    const summary = await runAnalysis({ articleIds: [article.id], limit: 1 });
    assert.equal(summary.analyzed + summary.embeddings_backfilled, 1, "Selected article must publish");
    assert.ok(await getArticleById(article.id), "Saved article must be available to the published query");
    const saved = await db.from("article_analyses").select("article_id,embedding").eq("article_id", article.id).single();
    assert.equal(saved.error, null);
    assert.ok(saved.data?.embedding);
    const repeat = await runAnalysis({ articleIds: [article.id], limit: 1 });
    assert.equal(repeat.attempted, 0);
    console.info("PASS: recent article published with embedding; repeat skipped", { article_id: article.id, scraped_at: article.scraped_at });
  }));
}

main().catch(() => {
  console.error("FAIL: freshness verification incomplete; inspect safe pipeline summaries. Apply the database upgrade first.");
  process.exitCode = 1;
});
