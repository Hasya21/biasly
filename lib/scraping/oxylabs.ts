import "server-only";
import { boundedText } from "../api/admin";
import { MAX_HTML_BYTES, PROVIDER_TIMEOUT_MS } from "../pipeline/limits";
import { publicUrl } from "../parsing/urls";
import { budgetSignal } from "../pipeline/budget";

export class ScrapeError extends Error {
  constructor(readonly code: string, readonly fatal = false) { super(code); }
}
export function checkScrapeConfiguration(): void {
  if (!process.env.OXY_WSA_USERNAME || !process.env.OXY_WSA_PASSWORD) throw new ScrapeError("provider_configuration", true);
}
export type ScrapedPage = { html: string; url: string };
export async function fetchPage(url: string, transport: typeof fetch = fetch): Promise<ScrapedPage> {
  checkScrapeConfiguration();
  publicUrl(url);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await transport("https://realtime.oxylabs.io/v1/queries", {
        method: "POST", cache: "no-store", redirect: "error", signal: budgetSignal(PROVIDER_TIMEOUT_MS),
        headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${process.env.OXY_WSA_USERNAME}:${process.env.OXY_WSA_PASSWORD}`).toString("base64")}` },
        body: JSON.stringify({ source: "universal", url }),
      });
      if (response.status === 401 || response.status === 403) { await response.body?.cancel(); throw new ScrapeError("provider_auth", true); }
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        if (!attempt) { await new Promise(resolve => setTimeout(resolve, 500)); continue; }
        throw new ScrapeError("provider_unavailable");
      }
      if (!response.ok) { await response.body?.cancel(); throw new ScrapeError("provider_request"); }
      // External provider identifiers are deliberately unused; never convert parsed IDs to strings.
      const payload: unknown = JSON.parse(await boundedText(response.body, MAX_HTML_BYTES));
      const results = payload && typeof payload === "object" && "results" in payload ? payload.results : null;
      const result: unknown = Array.isArray(results) ? results[0] : null;
      if (!result || typeof result !== "object" || !("content" in result) || typeof result.content !== "string" || !result.content.trim() ||
          !("status_code" in result) || result.status_code !== 200 || !("url" in result) || typeof result.url !== "string") throw new ScrapeError("provider_result");
      return { html: result.content, url: publicUrl(result.url) };
    } catch (error) {
      if (error instanceof ScrapeError) throw error;
      throw new ScrapeError(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name) ? "provider_timeout" : "provider_response");
    }
  }
  throw new ScrapeError("provider_unavailable");
}
