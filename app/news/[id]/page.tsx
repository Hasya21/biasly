import type { Metadata } from "next";
import { ArticleDetails } from "@/components/news-details/article-details";
import { getAuthorizedArticle, getPublicArticleIdentity } from "@/lib/news/load-article";
import { toNewsDetails } from "@/lib/news/presentation";
import { getRelatedArticles } from "@/lib/supabase/queries/articles";

type Props = { params: Promise<{ id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getPublicArticleIdentity((await params).id);
  return { title: article ? article.title + " | biasly" : "Story not found | biasly", description: "Article analysis and AI-estimated framing.", robots: { index: false, follow: false } };
}
export default async function NewsDetailsPage({ params }: Props) {
  const article = await getAuthorizedArticle((await params).id);
  const related = article.analysis.embedding ? await getRelatedArticles(article.id, article.analysis.embedding) : [];
  return <ArticleDetails details={toNewsDetails(article, related)} />;
}
