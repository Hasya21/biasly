import "server-only";
import { cache } from "react";
import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { getArticleById, getPublishedArticleIdentity } from "../supabase/queries/articles";

export const getPublicArticleIdentity = cache(async (id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  return getPublishedArticleIdentity(id);
});
export async function getAuthorizedArticle(id: string) {
  if (!await getPublicArticleIdentity(id)) notFound();
  await auth.protect();
  const article = await getArticleById(id);
  if (!article) notFound();
  return article;
}
