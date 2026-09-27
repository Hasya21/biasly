import "server-only";
import type { Embedding, NewAnalysis, NewArticle, StoredEmbedding } from "./types";

export const URL_CHUNK_SIZE = 15;
export const MAX_PAGE_SIZE = 100;
export const EMBEDDING_DIMENSIONS = 1536;

export class DataAccessError extends Error {
  readonly code: string;
  constructor(operation: string, code = "DATABASE_ERROR") {
    super(`Database operation failed: ${operation}.`);
    this.name = "DataAccessError";
    this.code = /^[A-Z0-9_]+$/.test(code) ? code : "DATABASE_ERROR";
  }
}

export function checkError(error: { code?: string } | null, operation: string): void {
  if (error) throw new DataAccessError(operation, error.code);
}
export function requiredText(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be nonempty text.`);
  return value.trim();
}
export function uuid(value: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Invalid UUID.");
  return value;
}
export function httpUrl(value: string): string {
  const text = requiredText(value, "URL");
  let url: URL;
  try { url = new URL(text); } catch { throw new Error("Invalid HTTP(S) URL."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || /\s/.test(text)) throw new Error("Invalid HTTP(S) URL.");
  url.hash = "";
  return url.href;
}
export function timestamp(value: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid ISO timestamp.");
  return value;
}
export function pageBounds(limit = 20, offset = 0): { limit: number; offset: number } {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(offset + limit)) throw new Error("Invalid pagination bounds.");
  return { limit, offset };
}
export function externalId(value: string): string {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) throw new Error("External IDs must be digit strings, never numbers.");
  return value;
}
export function validateArticle(input: NewArticle): NewArticle {
  const body = requiredText(input.raw_text, "Article body");
  if (body.length < 900 && body.split(/\n\s*\n/).filter(p => p.trim().length >= 40).length < 3) throw new Error("Article body needs 900 characters or three meaningful paragraphs.");
  return {
    source_id: uuid(input.source_id), original_url: httpUrl(input.original_url),
    canonical_url: httpUrl(input.canonical_url), title: requiredText(input.title, "Title"),
    image_url: httpUrl(input.image_url), published_at: timestamp(input.published_at), raw_text: body,
  };
}
export function validateAnalysis(input: NewAnalysis): NewAnalysis {
  for (const [value, low, high] of [[input.sentiment_score, -1, 1], [input.confidence, 0, 1], [input.left_percentage, 0, 100], [input.center_percentage, 0, 100], [input.right_percentage, 0, 100]]) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) throw new Error("Analysis score is out of range.");
  }
  if (Math.abs(input.left_percentage + input.center_percentage + input.right_percentage - 100) > 1e-9) throw new Error("Framing percentages must total 100.");
  if (!["positive", "neutral", "negative"].includes(input.sentiment_label) || !["left", "center", "right", "mixed", "unclear"].includes(input.bias_label)) throw new Error("Invalid analysis label.");
  if (!Array.isArray(input.framing_notes) || !Array.isArray(input.loaded_terms)) throw new Error("Analysis notes and terms must be arrays.");
  return {
    summary: requiredText(input.summary, "Summary"), sentiment_score: input.sentiment_score,
    sentiment_label: input.sentiment_label, bias_label: input.bias_label,
    left_percentage: input.left_percentage, center_percentage: input.center_percentage,
    right_percentage: input.right_percentage, confidence: input.confidence,
    framing_notes: input.framing_notes.map(s => requiredText(s, "Framing note")),
    loaded_terms: input.loaded_terms.map(s => requiredText(s, "Loaded term")),
    disclaimer: requiredText(input.disclaimer, "Disclaimer"), model: requiredText(input.model, "Model"),
  };
}

export function validateEmbedding(input: Embedding): Embedding {
  if (!Array.isArray(input) || input.length !== EMBEDDING_DIMENSIONS || input.some(value => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`Embedding must contain ${EMBEDDING_DIMENSIONS} finite numbers.`);
  }
  return input;
}

export function storedEmbedding(input: StoredEmbedding): Embedding {
  if (Array.isArray(input)) return validateEmbedding(input);
  if (typeof input !== "string" || !input.startsWith("[") || !input.endsWith("]")) throw new Error("Invalid stored embedding.");
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { throw new Error("Invalid stored embedding."); }
  return validateEmbedding(parsed as Embedding);
}
