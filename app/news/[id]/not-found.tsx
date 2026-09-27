import Link from "next/link";
import { Header } from "@/components/homepage/header";
import { Footer } from "@/components/homepage/footer";
import homeStyles from "@/components/homepage/homepage.module.css";
import styles from "@/components/news-details/details.module.css";

export default function StoryNotFound() {
  return <div className={homeStyles.page}><Header skipTarget="article-content" isHome={false} /><main id="article-content" tabIndex={-1} className={styles.notFound}><p>biasly News</p><h1>Story not found</h1><p>This article is unavailable or has not been analyzed yet. Explore the latest articles on our homepage.</p><Link href="/">Back to Top News</Link></main><Footer /></div>;
}
