import { load } from "cheerio";
import type { NewArticle, Source } from "../supabase/types";
import { articleUrl, publicUrl, strategyFor } from "./urls";

const hidden = 'nav,header,footer,aside,[hidden],[aria-hidden="true"],[style*="display:none"],[style*="display: none"]';
const cleanText = (text: string) => text.replace(/\s+/g, " ").trim();
export function extractCandidates(html: string, source: Source): { urls: string[]; found: number; rejected: number; duplicates: number } {
  const $ = load(html);
  $(hidden).remove();
  const strategy = strategyFor(source);
  const selector = strategy === "bbc" ? '[data-testid$="card"] a[href],a[href]:has(h2),a[href]:has(h3),h2 a[href],h3 a[href]' :
    strategy === "npr" ? 'article .title a[href]' :
    strategy === "reuters" ? 'a[data-testid="TitleLink"]' :
    strategy === "ap" ? '.PagePromo-title a[href]' :
    strategy === "guardian" ? 'a[data-link-name="article"],h3 a[href],h2 a[href],a[href]:has(h2),a[href]:has(h3)' : 'article h2 a[href],article h3 a[href],article a[href]:has(h2),article a[href]:has(h3)';
  const urls = new Set<string>();
  let found = 0, rejected = 0, duplicates = 0;
  $(selector).each((_index, element) => {
    if (!cleanText($(element).text())) return;
    found++;
    // NPR's dated URL shape is also used by podcast episodes; card context matters.
    if (strategy === "npr" && $(element).closest("article").find('a[href*="/podcasts/"],a[href*="/programs/"]').length) { rejected++; return; }
    if (strategy === "ap" && $(element).closest('[class*="PagePromo"]').text().match(/\b(?:live updates|sponsored content|press release)\b/i)) { rejected++; return; }
    const url = articleUrl($(element).attr("href") ?? "", source);
    if (!url) rejected++;
    else if (urls.has(url)) duplicates++;
    else urls.add(url);
  });
  return { urls: [...urls], found, rejected, duplicates };
}

type RecordValue = Record<string, unknown>;
function records(value: unknown, depth = 0): RecordValue[] {
  if (depth > 8) return [];
  if (Array.isArray(value)) return value.flatMap(item => records(item, depth + 1));
  if (!value || typeof value !== "object") return [];
  const object = value as RecordValue;
  return [object, ...records(object["@graph"], depth + 1)];
}
const string = (value: unknown) => typeof value === "string" ? value.trim() : "";
export type ArticleResult = { article: NewArticle } | { reason: string };
export function parseArticle(html: string, originalUrl: string, finalUrl: string, source: Source): ArticleResult {
  if (!articleUrl(finalUrl, source) || !articleUrl(originalUrl, source)) return { reason: "invalid_article_url" };
  const $ = load(html);
  const structured: RecordValue[] = [];
  $('script[type="application/ld+json"]').each((_i, element) => {
    try { structured.push(...records(JSON.parse($(element).text()))); } catch { /* Ignore malformed metadata. */ }
  });
  const metadata = structured.find(item => [item["@type"]].flat().some(type => typeof type === "string" && /^(NewsArticle|Article|ReportageNewsArticle|AnalysisNewsArticle)$/.test(type))) ?? {};
  if (structured.some(item => [item["@type"]].flat().includes("LiveBlogPosting"))) return { reason: "live_page" };
  const canonical = articleUrl($('link[rel="canonical"]').attr("href") || finalUrl, source, finalUrl);
  if (!canonical) return { reason: "invalid_canonical" };
  const meta = (name: string) => $(`meta[property="${name}"],meta[name="${name}"]`).first().attr("content")?.trim() ?? "";
  const title = cleanText($('h1').first().text() || string(metadata.headline) || meta("og:title"));
  if (title.length < 20 || /^(home|news|latest news|world news|bbc news|the guardian|politics|business|sport|live)(\s*[-|:].*)?$/i.test(title)) return { reason: "generic_title" };
  const rawDate = string(metadata.datePublished) || meta("article:published_time") || meta("datePublished") || $('time[datetime]').first().attr("datetime") || "";
  const date = Date.parse(rawDate);
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(rawDate) || !Number.isFinite(date) || date > Date.now() + 86400000) return { reason: "missing_date" };
  const imageData = Array.isArray(metadata.image) ? metadata.image[0] : metadata.image;
  const rawImage = meta("og:image") || string(imageData) || (imageData && typeof imageData === "object" ? string((imageData as RecordValue).url) : "");
  let image: string;
  try { if (!rawImage) return { reason: "missing_image" }; image = publicUrl(rawImage, finalUrl); } catch { return { reason: "missing_image" }; }
  $(hidden + ',script,style,noscript,iframe,figure,figcaption,button,form,.caption,.Figure,.Carousel,.CarouselOverlay,.AudioEnhancement,.PagePromo,[data-testid="Newsletter"],[data-component="social-share"],[data-component="links-block"],[data-component="newsletter-block"]').remove();
  $('[class],[data-component]').each((_i, element) => {
    const marker = `${$(element).attr("class") ?? ""} ${$(element).attr("data-component") ?? ""}`;
    if (/(?:^|[\s_-])(related|newsletter|subscription|most-viewed|advert|advertisement|share|social|byline|author-bio|promo)(?:[\s_-]|$)/i.test(marker)) $(element).remove();
  });
  const strategy = strategyFor(source);
  const root = strategy === "bbc" ? $('[data-component="text-block"]') : strategy === "guardian" ? $('[data-gu-name="body"],.article-body-commercial-selector,[itemprop="articleBody"]') :
    strategy === "npr" ? $("#storytext") : strategy === "ap" ? $(".RichTextStoryBody") :
    strategy === "reuters" ? $('[class*="article-body-module__content"]') : $('[itemprop="articleBody"],article');
  const paragraphs: string[] = [];
  root.find(strategy === "reuters" ? '[data-testid^="paragraph-"]' : "p").each((_i, element) => {
    const node = $(element);
    const text = cleanText(node.text());
    const linked = cleanText(node.find("a").text()).length;
    if (text.length < 40 || linked > text.length * 0.6 || /^(sign up|subscribe|read more|related:|share this|most viewed|advertisement|follow us|reporting by|editing by)/i.test(text) || /(?:\{\s*[\w-]+:|ReferenceError:|TypeError:|function\s*\(|window\.)/.test(text)) return;
    if (!paragraphs.includes(text)) paragraphs.push(text);
  });
  // Explicit articleBody metadata is a fallback, never the entire document text.
  if (!paragraphs.length && string(metadata.articleBody).length >= 900) paragraphs.push(cleanText(string(metadata.articleBody)));
  if (paragraphs.length === 1) {
    const sentences = paragraphs[0].match(/[^.!?]+[.!?]+(?:["”’']|$)?|[^.!?]+$/g) ?? [];
    if (sentences.length >= 6) {
      paragraphs.length = 0;
      for (let i = 0; i < sentences.length; i += 3) paragraphs.push(cleanText(sentences.slice(i, i + 3).join(" ")));
    }
  }
  const body = paragraphs.join("\n\n");
  if (body.length < 900 && paragraphs.filter(p => p.length >= 40).length < 3) return { reason: "weak_body" };
  if (/(?:ReferenceError:|TypeError:|window\.|\{\s*[\w-]+:)/.test(body)) return { reason: "noisy_body" };
  return { article: { source_id: source.id, original_url: originalUrl, canonical_url: canonical, title, image_url: image, published_at: new Date(date).toISOString(), raw_text: body } };
}
