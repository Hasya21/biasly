import { isIP } from "node:net";
import type { Source } from "../supabase/types";

export type Strategy = "bbc" | "guardian" | "npr" | "reuters" | "ap" | "generic";
export function publicUrl(value: string, base?: string): string {
  const url = new URL(value, base);
  const host = url.hostname.toLowerCase();
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port ||
      isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".") ||
      /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host)) throw new Error("unsafe_url");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid|CMP|cmp|ocid|at_.+)$/.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}

export function strategyFor(source: Source): Strategy {
  if (source.parser_strategy) {
    if (["bbc", "guardian", "npr", "reuters", "ap", "generic"].includes(source.parser_strategy)) return source.parser_strategy as Strategy;
    throw new Error("unsupported_strategy");
  }
  const host = new URL(source.listing_url).hostname;
  if (/(^|\.)bbc\.(com|co\.uk)$/.test(host)) return "bbc";
  if (/(^|\.)theguardian\.com$/.test(host)) return "guardian";
  if (/^(www\.)?npr\.org$/.test(host)) return "npr";
  if (/^(www\.)?reuters\.com$/.test(host)) return "reuters";
  if (/^(www\.)?apnews\.com$/.test(host)) return "ap";
  return "generic";
}

export function publisherUrl(value: string, source: Source, base = source.listing_url): string {
  const url = publicUrl(value, base);
  const actual = new URL(url).hostname.replace(/^www\./, "");
  const expected = new URL(source.listing_url).hostname.replace(/^www\./, "");
  const bbc = strategyFor(source) === "bbc" && ["bbc.com", "bbc.co.uk"].includes(expected) && ["bbc.com", "bbc.co.uk"].includes(actual);
  if (actual !== expected && !bbc) throw new Error("off_publisher");
  return url;
}

const forbidden = /\/(?:live|live-news|liveblog|sport|sports|topics?|tags?|authors?|profile|search|sections?|categories|shows?|programmes?|programs?|podcasts?|games?|crosswords?|shopping|reviews?|products?|thefilter[^/]*|about|help|support|contact|newsletters?|subscribe|subscription|signin|register|video|videos|audio)(?:\/|$)/i;
export function articleUrl(value: string, source: Source, base?: string): string | null {
  try {
    const normalized = publisherUrl(value, source, base);
    const path = decodeURIComponent(new URL(normalized).pathname);
    const strategy = strategyFor(source);
    // Only a complete dated NPR article identity can bypass the section-landing exclusion.
    const nprStory = /^\/(?:sections\/[a-z0-9-]+\/)?\d{4}\/\d{2}\/\d{2}\/(?:\d{6,}|[a-z]+-s\d+-\d+)\/[a-z0-9]+(?:-[a-z0-9]+)+\/?$/i.test(path);
    const checkedPath = strategy === "npr" && nprStory ? path.replace(/^\/sections\//, "/") : path;
    if (forbidden.test(checkedPath) || normalized === publicUrl(source.listing_url)) return null;
    if (strategy === "npr") return nprStory ? normalized : null;
    if (strategy === "reuters") return /^\/(?:world|business|markets|technology|science|sustainability|legal|investigations|commentary)\/(?:[a-z0-9-]+\/)*[a-z0-9]+(?:-[a-z0-9]+){2,}-\d{4}-\d{2}-\d{2}\/?$/i.test(path) ? normalized : null;
    if (strategy === "ap") return /^\/article\/[a-z0-9]+(?:-[a-z0-9]+)+-[a-f0-9]{32}\/?$/i.test(path) ? normalized : null;
    if (strategy === "bbc") return /^\/news\/(?:articles\/[a-z0-9]{8,}|[a-z0-9-]+-\d{7,})\/?$/i.test(path) ? normalized : null;
    if (strategy === "guardian") return /^\/[a-z0-9-]+\/\d{4}\/[a-z]{3}\/\d{2}\/[a-z0-9]+(?:-[a-z0-9]+){2,}\/?$/i.test(path) ? normalized : null;
    return /\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9-]{15,}\/?$/i.test(path) || /^\/(?:news|story|article)\/[a-z0-9]+(?:-[a-z0-9]+){4,}\/?$/i.test(path) ? normalized : null;
  } catch { return null; }
}
