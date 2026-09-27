import "server-only";
import { getSupabaseAdmin } from "../server";
import type { Article, ArticleDetails, NewArticle, PendingArticle, PendingCursor, PublishedArticle, RelatedArticle, StoredEmbedding } from "../types";
import { checkError, httpUrl, pageBounds, storedEmbedding, timestamp, URL_CHUNK_SIZE, uuid, validateArticle } from "../validation";

const feedProjection = "id,title,image_url,published_at,original_url,canonical_url,source:sources!inner(id,name,listing_url,logo_url),analysis:article_analyses!inner(sentiment_label,bias_label,left_percentage,center_percentage,right_percentage,confidence,model)";
const detailsProjection = "id,title,image_url,published_at,original_url,canonical_url,raw_text,source:sources!inner(id,name,listing_url,logo_url),analysis:article_analyses!inner(*)";

export async function getPublishedArticles(options: { limit?: number; offset?: number } = {}): Promise<PublishedArticle[]> {
  const { limit, offset } = pageBounds(options.limit, options.offset);
  const { data, error } = await getSupabaseAdmin().from("articles").select(feedProjection)
    .not("analyzed_at", "is", null).order("published_at", { ascending: false }).order("id", { ascending: false })
    .range(offset, offset + limit - 1);
  checkError(error, "read published articles");
  return data ?? [];
}

/** Public title/existence lookup, without body or full analysis. */
export async function getPublishedArticleIdentity(id: string): Promise<{ id: string; title: string } | null> {
  const { data, error } = await getSupabaseAdmin().from("articles")
    .select("id,title,article_analyses!inner(id)").eq("id", uuid(id)).not("analyzed_at", "is", null).maybeSingle();
  checkError(error, "read published article identity");
  return data ? { id: data.id, title: data.title } : null;
}

/** The caller must check Clerk authorization before calling this detail read. */
export async function getArticleById(id: string): Promise<ArticleDetails | null> {
  const { data, error } = await getSupabaseAdmin().from("articles").select(detailsProjection)
    .eq("id", uuid(id)).not("analyzed_at", "is", null).maybeSingle();
  checkError(error, "read article details");
  return data;
}

/** Returns matching input URLs. Each filter is capped at 15 URLs. */
export async function findExistingArticleUrls(urls: string[]): Promise<Set<string>> {
  const normalized = [...new Set(urls.map(httpUrl))];
  const existing = new Set<string>();
  for (let start = 0; start < normalized.length; start += URL_CHUNK_SIZE) {
    const chunk = normalized.slice(start, start + URL_CHUNK_SIZE);
    const results = await Promise.all([
      getSupabaseAdmin().from("articles").select("original_url,canonical_url").in("original_url", chunk),
      getSupabaseAdmin().from("articles").select("original_url,canonical_url").in("canonical_url", chunk),
    ]);
    for (const { data, error } of results) {
      checkError(error, "check article URLs");
      for (const row of data ?? []) {
        if (chunk.includes(row.original_url)) existing.add(row.original_url);
        if (chunk.includes(row.canonical_url)) existing.add(row.canonical_url);
      }
    }
  }
  return existing;
}

export async function insertArticle(input: NewArticle): Promise<{ status: "inserted"; article: Article } | { status: "duplicate" }> {
  const row = validateArticle(input);
  const { data, error } = await getSupabaseAdmin().from("articles").insert(row).select("*").single();
  if (error?.code === "23505") return { status: "duplicate" };
  checkError(error, "insert article");
  if (!data) throw new Error("Article insert returned no row.");
  return { status: "inserted", article: data };
}

/** Advance the cursor even for failed articles; restart without it on the next run. */
export async function getPendingArticles(options: { limit?: number; after?: PendingCursor; articleIds?: string[] } = {}): Promise<PendingArticle[]> {
  const { limit } = pageBounds(options.limit ?? 5);
  const { data, error } = await getSupabaseAdmin().rpc("get_pending_articles", {
    p_limit: limit,
    ...(options.after ? { p_after_scraped_at: timestamp(options.after.scraped_at), p_after_id: uuid(options.after.id) } : {}),
    ...(options.articleIds ? { p_article_ids: options.articleIds.map(uuid) } : {}),
  });
  checkError(error, "read pending articles");
  return data ?? [];
}

/** Server-only cosine match. The database excludes the current and unpublished articles. */
export async function getRelatedArticles(articleId: string, embedding: StoredEmbedding): Promise<RelatedArticle[]> {
  const { data, error } = await getSupabaseAdmin().rpc("match_related_articles", {
    p_article_id: uuid(articleId), p_query_embedding: storedEmbedding(embedding), p_limit: 5,
  });
  checkError(error, "read related articles");
  return data ?? [];
}
