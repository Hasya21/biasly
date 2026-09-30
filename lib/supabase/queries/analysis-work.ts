import "server-only";
import { getSupabaseAdmin } from "../server";
import { checkError, pageBounds, uuid } from "../validation";
import type { PendingArticle } from "../types";

export async function getAnalysisCandidates(options: { runId: string; limit: number; articleIds?: string[] }): Promise<PendingArticle[]> {
  const { data, error } = await getSupabaseAdmin().rpc("get_analysis_candidates", {
    p_run_id: uuid(options.runId), p_limit: pageBounds(options.limit).limit,
    ...(options.articleIds ? { p_article_ids: options.articleIds.map(uuid) } : {}),
  });
  checkError(error, "select eligible analysis work");
  return data ?? [];
}

export async function claimArticleAnalysis(articleId: string, runId: string): Promise<string | null> {
  const { data, error } = await getSupabaseAdmin().rpc("claim_article_analysis", {
    p_article_id: uuid(articleId), p_run_id: uuid(runId),
  });
  checkError(error, "claim article analysis");
  return data;
}

export async function finishArticleAnalysis(articleId: string, token: string, errorCode?: string): Promise<void> {
  const { data, error } = await getSupabaseAdmin().rpc("finish_article_analysis", {
    p_article_id: uuid(articleId), p_token: uuid(token), p_success: !errorCode,
    ...(errorCode ? { p_error_code: errorCode } : {}),
  });
  checkError(error, "finish article analysis");
  if (!data) throw new Error("Analysis claim ownership lost.");
}
