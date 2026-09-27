"use client";

import { NewsImage } from "@/components/news-image";
import Link from "next/link";
import { Info } from "lucide-react";
import { BiasMeter } from "@/components/bias-meter";
import type { NewsCardView } from "@/lib/news/presentation";
import posthog from "posthog-js";
import styles from "./homepage.module.css";

export function StoryCard({ article, eager = false }: { article: NewsCardView; eager?: boolean }) {
  const confidence = article.confidence;
  const hasConfidence = Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
  function trackArticleOpen(openLocation: "image" | "headline") {
    posthog.capture("article_opened", {
      article_id: article.id,
      open_location: openLocation,
      source: article.source,
      framing: article.framingLabel,
      is_demo: article.isDemo,
    });
  }
  return (
    <article className={styles.card} aria-labelledby={`story-${article.id}`}>
      <div className={styles.imageWrap}>
        <Link href={`/news/${article.id}`} aria-label={`Read ${article.title}`} className={styles.imageLink} onClick={() => trackArticleOpen("image")}><NewsImage src={article.imageUrl} sizes="(max-width: 599px) calc(100vw - 32px), (max-width: 899px) 46vw, (max-width: 1400px) 30vw, 410px" eager={eager} className={styles.image} /></Link>
        <details className={styles.info}>
          <summary aria-label={`About the framing for ${article.title}`}><Info size={16} aria-hidden="true" /></summary>
          <div><strong>Understanding the framing</strong><p>Left, center, and right describe AI-estimated political framing of this article, not objective truth or a publisher rating.</p>{article.isDemo && <p>Demo article: scores were supplied manually for testing.</p>}</div>
        </details>
      </div>
      <div className={styles.cardBody}>
        {article.isDemo && <p className={styles.category}>Demo article · Manual test scores</p>}
        <h2 id={`story-${article.id}`} className={styles.headline}><Link href={`/news/${article.id}`} onClick={() => trackArticleOpen("headline")}>{article.title}</Link></h2>
        <div className={styles.analysis}>
          <p className={styles.analysisLabel}>AI-estimated framing: <span>{article.framingLabel}</span></p>
          <BiasMeter percentages={article.percentages} showLegend showAxis className={styles.meter} />
          <p className={styles.analysisMeta}><span>Sentiment: <span>{article.sentiment}</span></span><span>{hasConfidence ? `${Math.round(confidence * 100)}% confidence` : "Confidence unavailable"}</span></p>
        </div>
        <div className={styles.cardFoot}><time dateTime={article.publishedAt}>{article.publishedLabel}</time></div>
        <p className={styles.source}>{article.source}</p>
      </div>
    </article>
  );
}
