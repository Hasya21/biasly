import assert from "node:assert/strict";
import { getPendingArticles, getArticleById } from "../lib/supabase/queries/articles";
import { getSupabaseAdmin } from "../lib/supabase/server";
import { runAnalysis } from "../lib/pipeline/analyze";
import { ANALYSIS_DISCLAIMER } from "../lib/ai/analysis-schema";

async function main() {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.log("BLOCKED: OPENAI_API_KEY is not configured; no model call made.");
    process.exitCode = 1;
    return;
  }
  const pending = await getPendingArticles({ limit: 1 });
  console.log(`Pending-selection RPC verified; smoke-test selection: ${pending.length} article.`);
  if (!pending.length) return;
  const id = pending[0].id;
  const result = await runAnalysis({ articleIds: [id], limit: 1 });
  assert.equal(result.analyzed, 1, "One article must be analyzed");
  const { data, error } = await getSupabaseAdmin().from("article_analyses").select("*").eq("article_id", id);
  assert.equal(error, null); assert.equal(data?.length, 1);
  const analysis = data![0];
  assert.equal(analysis.left_percentage + analysis.center_percentage + analysis.right_percentage, 100);
  assert.ok(Math.abs(analysis.bias_score - (analysis.right_percentage - analysis.left_percentage) / 100) < 1e-9);
  assert.equal(analysis.disclaimer, ANALYSIS_DISCLAIMER);
  assert.equal((await getPendingArticles({ articleIds: [id] })).length, 0);
  assert.ok(await getArticleById(id), "Saved article must be available to the authorized detail query");
  const repeat = await runAnalysis({ articleIds: [id] });
  assert.equal(repeat.attempted, 0);
  console.log(`PASS: article ${id}; atomic save, percentages, bias score, publication query and repeat-run skip verified. Model: ${analysis.model}`);
}
main().catch(() => { console.error("FAIL: analysis smoke test did not complete; inspect the safe pipeline summary above."); process.exitCode = 1; });
