"use client";

import { ArrowUpRight, Info } from "lucide-react";
import type { ReactNode } from "react";
import { safeArticleUrl, type NewsDetailsView } from "@/lib/news/presentation";
import posthog from "posthog-js";
import styles from "./details.module.css";

export function InfoDisclosure({ label, children }: { label: string; children: ReactNode }) {
  return <details className={styles.info}><summary aria-label={label}><Info size={15} aria-hidden="true" /></summary><div>{children}</div></details>;
}

export function AnalysisSidebar({ details }: { details: NewsDetailsView }) {
  const { article, summary, framingNotes, loadedTerms } = details;
  const originalUrl = safeArticleUrl(details.originalUrl);
  const label = article.framingLabel;
  const strongest = label === "left" || label === "center" || label === "right" ? article.percentages[label] : undefined;
  const confidence = article.confidence;
  const hasConfidence = Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
  return <aside className={styles.sidebar} aria-label="Article analysis">
    <section className={styles.panel}>
      <div className={styles.panelHeading}><h2>Analysis overview</h2><InfoDisclosure label="About this analysis">Framing is an AI estimate, not objective truth. Estimates describe the article text, not its publisher.{article.isDemo && " This demo uses manually supplied scores."}</InfoDisclosure></div>
      <p className={styles.eyebrow}>AI-estimated framing</p>
      <p className={styles.overall} data-framing={label}>{label}{strongest !== undefined && ` ${strongest}%`}</p>
      <p className={styles.muted}>{article.isDemo ? "Manual demo scores" : "Article-level framing"}</p>
      <dl className={styles.facts}><div><dt>Sentiment</dt><dd>{article.sentiment}</dd></div><div><dt>Confidence</dt><dd>{hasConfidence ? `${Math.round(confidence * 100)}%` : "Unavailable"}</dd></div></dl>
      <p className={styles.explanation}>Framing reflects how a story presents its subject, including emphasis and word choice. It is not a rating of whether the story is true.</p>
      <details className={styles.method}><summary>About framing estimates</summary><p>Article text supplies the evidence for left, center, and right framing estimates. Source names alone do not determine the result. Mixed or unclear labels reflect ambiguity. Estimates can be wrong; compare the notes with the original article.</p></details>
    </section>
    <section className={styles.panel}>
      <div className={styles.panelHeading}><h2>{article.isDemo ? "Demo Summary" : "AI Summary"}</h2><InfoDisclosure label="About this summary">This summary comes from the saved article analysis. Summaries can make mistakes; consult the original article.{article.isDemo && " This demo summary was written manually."}</InfoDisclosure></div>
      <p className={styles.muted}><time dateTime={article.publishedAt}>{article.publishedLabel}</time></p>
      <p className={styles.storedSummary}>{summary}</p>
      <div className={styles.notes}><h3>Framing evidence</h3>{framingNotes.length ? <ul className={styles.evidenceList}>{framingNotes.map((note, index) => <li key={index}>{note}</li>)}</ul> : <p>No framing notes were recorded.</p>}<h3>Loaded terms</h3>{loadedTerms.length ? <ul className={styles.terms}>{loadedTerms.map((term, index) => <li key={index}>{term}</li>)}</ul> : <p>No loaded terms were recorded.</p>}</div>
      <div className={styles.provenance}><p>{details.disclaimer}</p><p>Model: <span>{details.model}</span></p></div>
    </section>
    <section className={styles.panel}>
      <div className={styles.panelHeading}><h2>About this article</h2><InfoDisclosure label="About article framing">AI-estimated framing describes the text of this article. It does not establish the publisher&apos;s political position or compare coverage across publications.</InfoDisclosure></div>
      <dl className={styles.articleMetadata}>
        <div><dt>Publisher</dt><dd className={styles.publisher}>{article.source}</dd></div>
        <div><dt>Published</dt><dd><time dateTime={article.publishedAt}>{article.publishedLabel}</time></dd></div>
      </dl>
      {originalUrl ? <a className={styles.originalLink} href={originalUrl} target="_blank" rel="noopener noreferrer" onClick={() => posthog.capture("original_article_opened", { article_id: article.id, source: article.source, framing: article.framingLabel, is_demo: article.isDemo })}>Read original article <ArrowUpRight size={15} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a> : <p className={styles.originalUnavailable}>Original article link unavailable.</p>}
      <p className={styles.articleContext}>The AI-estimated framing above applies to this article&apos;s wording and emphasis. It is not a rating of the publisher.</p>
      {article.isDemo && <p className={styles.smallNote}>Fictional demo article with manually supplied analysis.</p>}
    </section>
  </aside>;
}
