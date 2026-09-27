import "server-only";
import { getSupabaseAdmin } from "../server";
import type { ArticleAnalysis, Embedding, NewAnalysis } from "../types";
import { checkError, uuid, validateAnalysis, validateEmbedding } from "../validation";

/** Atomic, idempotent: an existing valid analysis wins over a later retry. */
export async function saveArticleAnalysis(articleId: string, input: NewAnalysis, embedding: Embedding): Promise<ArticleAnalysis> {
  const analysis = validateAnalysis(input);
  const { data, error } = await getSupabaseAdmin().rpc("save_article_analysis", {
    p_article_id: uuid(articleId), p_analysis: analysis, p_embedding: validateEmbedding(embedding),
  }).single();
  checkError(error, "save article analysis");
  if (!data) throw new Error("Analysis save returned no row.");
  return data;
}

/** Idempotent backfill: only the first valid embedding fills a null column. */
export async function saveArticleEmbedding(articleId: string, embedding: Embedding): Promise<ArticleAnalysis> {
  const { data, error } = await getSupabaseAdmin().rpc("save_article_embedding", {
    p_article_id: uuid(articleId), p_embedding: validateEmbedding(embedding),
  }).single();
  checkError(error, "save article embedding");
  if (!data) throw new Error("Embedding save returned no row.");
  return data;
}
