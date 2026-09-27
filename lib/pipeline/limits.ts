export const DEFAULT_ARTICLE_LIMIT = 5;
export const MAX_ARTICLE_LIMIT = 20;
export const MAX_REQUEST_BYTES = 8192;
export const MAX_HTML_BYTES = 12 * 1024 * 1024;
export const PROVIDER_TIMEOUT_MS = 180_000;
export const detailAttemptLimit = (limit: number) => Math.min(100, Math.max(30, limit * 6));
