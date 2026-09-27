import type { ReactNode } from "react";
import Image from "next/image";
import { Clock, Newspaper } from "lucide-react";
import { BiasMeter, type FramingPercentages } from "@/components/bias-meter";

export type NewsCardArticle = {
  title: string;
  source: string;
  publishedAt: string;
  publishedLabel: string;
  summary: string;
  imageUrl?: string;
  imageAlt?: string;
  sentiment: "positive" | "neutral" | "negative";
  framingLabel: "left" | "center" | "right" | "mixed" | "unclear";
  percentages: FramingPercentages;
  confidence?: number;
  readTimeMinutes?: number;
};

export function NewsCard({ article, action, illustrative = false }: { article: NewsCardArticle; action?: ReactNode; illustrative?: boolean }) {
  const confidence = article.confidence;
  return (
    <article className="grid min-w-0 gap-6 rounded-lg border bg-background p-4 sm:grid-cols-[minmax(120px,0.7fr)_minmax(0,1fr)]">
      <div className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-md bg-secondary">
        {article.imageUrl ? <Image src={article.imageUrl} alt={article.imageAlt ?? ""} fill unoptimized sizes="(max-width: 640px) 100vw, 240px" className="object-cover" /> : <div className="flex flex-col items-center gap-3 text-muted-foreground"><Newspaper size={40} strokeWidth={1.5} aria-hidden="true" /><span className="text-caption">Article image</span></div>}
      </div>
      <div className="min-w-0 space-y-3">
        <p className="text-caption">{article.source}{illustrative && <span className="text-muted-foreground"> · Illustrative example</span>}</p>
        <h3 className="text-h4 font-semibold">{article.title}</h3>
        <p className="text-body-sm">{article.summary}</p>
        <div className="space-y-2">
          <p className="text-caption">AI-estimated framing: <span className="capitalize">{article.framingLabel}</span></p>
          <BiasMeter percentages={article.percentages} />
          <p className="text-caption text-muted-foreground">Sentiment: <span className="capitalize">{article.sentiment}</span>{confidence !== undefined && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? " · " + Math.round(confidence * 100) + "% confidence" : ""}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-caption">
          <span className="inline-flex items-center gap-2"><Clock size={16} aria-hidden="true" /><time dateTime={article.publishedAt}>{article.publishedLabel}</time></span>
          {action}
          {article.readTimeMinutes !== undefined && article.readTimeMinutes > 0 && Number.isFinite(article.readTimeMinutes) && <span>{article.readTimeMinutes} min read</span>}
        </div>
      </div>
    </article>
  );
}
