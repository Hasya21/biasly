import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./homepage.module.css";

export function Feed({ items, page, hasNext }: { items: { id: string; card: ReactNode }[]; page: number; hasNext: boolean }) {
  return <main id="top-news" className={styles.main}>
    <div className={styles.sectionHeading}><h1>Top News</h1></div>
    <p className={styles.previewNote}>Explore published articles and their AI-estimated framing.</p>
    <div className={styles.grid}>{items.map(item => <div className={styles.cardSlot} key={item.id}>{item.card}</div>)}</div>
    {items.length === 0 && <div className={styles.empty}><h2>{page === 1 ? "No analyzed articles yet" : "No articles on this page"}</h2><p>{page === 1 ? "Articles will appear here once their analysis is saved." : "Return to the latest news to see available articles."}</p>{page > 1 && <Link href="/">Back to latest news</Link>}</div>}
    {(page > 1 || hasNext) && <nav aria-label="News pages" className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm">
      {page > 1 && <Link className="underline underline-offset-4" href={page === 2 ? "/" : "/?page=" + (page - 1)}>Previous page</Link>}
      <span aria-current="page">Page {page}</span>
      {hasNext && <Link className="underline underline-offset-4" href={"/?page=" + (page + 1)}>Next page</Link>}
    </nav>}
  </main>;
}
