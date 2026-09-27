import type { ArticleDetails, PublishedArticle, RelatedArticle } from "../supabase/types";

export function safeArticleUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

export function toNewsCard(row: PublishedArticle) {
  return {
    id: row.id, title: row.title, source: row.source.name,
    publishedAt: row.published_at,
    publishedLabel: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(row.published_at)),
    imageUrl: safeArticleUrl(row.image_url), framingLabel: row.analysis.bias_label,
    sentiment: row.analysis.sentiment_label, confidence: row.analysis.confidence,
    percentages: { left: row.analysis.left_percentage, center: row.analysis.center_percentage, right: row.analysis.right_percentage },
    isDemo: row.analysis.model === "manual-demo-fixture",
  };
}
export function toNewsDetails(row: ArticleDetails, related: RelatedArticle[] = []) {
  return {
    article: toNewsCard(row), paragraphs: row.raw_text.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean),
    originalUrl: safeArticleUrl(row.original_url), summary: row.analysis.summary,
    framingNotes: row.analysis.framing_notes, loadedTerms: row.analysis.loaded_terms,
    disclaimer: row.analysis.disclaimer, model: row.analysis.model,
    readTime: Math.max(1, Math.ceil(row.raw_text.trim().split(/\s+/).length / 220)),
    relatedArticles: related.map(article => ({
      id: article.id, title: article.title, source: article.source_name,
      imageUrl: safeArticleUrl(article.image_url), publishedAt: article.published_at,
      publishedLabel: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(article.published_at)),
    })),
  };
}
export type NewsCardView = ReturnType<typeof toNewsCard>;
export type NewsDetailsView = ReturnType<typeof toNewsDetails>;
