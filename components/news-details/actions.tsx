"use client";

import { useState } from "react";
import { Bookmark, Share2 } from "lucide-react";
import posthog from "posthog-js";
import styles from "./details.module.css";

export function ArticleActions({ articleId, title }: { articleId: string; title: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function share() {
    setBusy(true);
    setMessage("");
    const url = window.location.href;
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: `Illustrative preview: ${title}`, url });
          posthog.capture("article_shared", { article_id: articleId, share_method: "native" });
          setMessage("Preview shared.");
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(url);
      posthog.capture("article_link_copied", { article_id: articleId });
      setMessage("Preview link copied.");
    } catch {
      setMessage("Unable to copy. Copy the page address from your browser.");
    } finally { setBusy(false); }
  }
  return <div className={styles.actions}>
    <span aria-disabled="true" title="Saving stories is not available in this preview">Save <Bookmark size={17} aria-hidden="true" /><span className="sr-only"> (unavailable)</span></span>
    <button onClick={share} disabled={busy}>Share <Share2 size={17} aria-hidden="true" /></button>
    <span role="status" className={styles.shareStatus}>{message}</span>
  </div>;
}
