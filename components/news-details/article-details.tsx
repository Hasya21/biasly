import { NewsImage } from "@/components/news-image";
import { BiasMeter } from "@/components/bias-meter";
import Link from "next/link";
import { Header } from "@/components/homepage/header";
import { Footer } from "@/components/homepage/footer";
import type { NewsDetailsView } from "@/lib/news/presentation";
import homeStyles from "@/components/homepage/homepage.module.css";
import { ArticleActions } from "./actions";
import { AnalysisSidebar, InfoDisclosure } from "./analysis-sidebar";
import styles from "./details.module.css";

export function ArticleDetails({ details }: { details: NewsDetailsView }) {
  const { article, paragraphs, readTime } = details;
  return <div className={homeStyles.page}>
    <Header skipTarget="article-content" isHome={false} />
    <main id="article-content" tabIndex={-1} className={styles.main}>
      {article.isDemo && <p className={styles.preview}>Demo article <span>Fictional content and manually supplied test scores</span></p>}
      <div className={styles.columns}>
        <article className={styles.article} aria-labelledby="article-title">
          <header className={styles.articleHeader}>
            <h1 id="article-title">{article.title}</h1>
            <div className={styles.byline}><div><strong>{article.source}</strong><time dateTime={article.publishedAt}>{article.publishedLabel}</time><span>{readTime} min read</span></div><ArticleActions articleId={article.id} title={article.title} /></div>
          </header>
          <figure className={styles.figure}>
            <div className={styles.hero}><NewsImage src={article.imageUrl} eager sizes="(max-width: 899px) calc(100vw - 32px), (max-width: 1400px) 62vw, 860px" /></div>
            {article.isDemo && <figcaption>Illustrative image for a fictional demonstration article.</figcaption>}
          </figure>
          <section className={styles.distribution} aria-label="Article framing distribution"><div><h2>AI-estimated framing</h2><InfoDisclosure label="About the distribution">The bar shows AI-estimated political framing for this article. It does not represent the proportion of sources.</InfoDisclosure></div><BiasMeter percentages={article.percentages} showLegend showAxis /><p>Article-level distribution{article.isDemo && " · Manual demo scores"}</p></section>
          <div className={styles.body}>{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
          {details.relatedArticles.length > 0 && <section className={styles.related} aria-labelledby="related-articles-title">
            <h2 id="related-articles-title">Related Articles</h2>
            <p>More analyzed reporting with similar themes.</p>
            <div className={styles.relatedGrid}>{details.relatedArticles.map(related => <article className={styles.relatedStory} key={related.id}>
              <Link href={`/news/${related.id}`} className={styles.relatedImage} aria-label={`Read ${related.title}`}><NewsImage src={related.imageUrl} sizes="(max-width: 599px) 96px, 160px" /></Link>
              <div><h3><Link href={`/news/${related.id}`}>{related.title}</Link></h3><p className={styles.relatedMeta}>{related.source} · <time dateTime={related.publishedAt}>{related.publishedLabel}</time></p></div>
            </article>)}</div>
          </section>}
        </article>
        <AnalysisSidebar details={details} />
      </div>
    </main>
    <Footer previewLabel="AI-estimated article framing" />
  </div>;
}
