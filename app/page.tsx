import { connection } from "next/server";
import { Header } from "@/components/homepage/header";
import { Feed } from "@/components/homepage/feed";
import { Footer } from "@/components/homepage/footer";
import { StoryCard } from "@/components/homepage/story-card";
import { getPublishedArticles } from "@/lib/supabase/queries/articles";
import { toNewsCard } from "@/lib/news/presentation";
import styles from "@/components/homepage/homepage.module.css";

export default async function Home({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await connection();
  const input = (await searchParams).page;
  const parsed = typeof input === "string" && /^\d+$/.test(input) ? Number(input) : 1;
  const page = Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100_000 ? parsed : 1;
  const rows = await getPublishedArticles({ limit: 21, offset: (page - 1) * 20 });
  return <div className={styles.page}>
    <Header />
    <Feed page={page} hasNext={rows.length > 20} items={rows.slice(0, 20).map((row, index) => ({
      id: row.id, card: <StoryCard article={toNewsCard(row)} eager={index < 3} />,
    }))} />
    <Footer previewLabel="AI-estimated article framing" />
  </div>;
}
