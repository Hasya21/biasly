import { after } from "next/server";
import { flushPostHogLogs, logPostHogPipelineEvent } from "@/instrumentation";
import { apiError, requireAdmin } from "@/lib/api/admin";
import { readScrapeOptions, runScrape } from "@/lib/pipeline/scrape";

export const runtime = "nodejs";
export async function POST(request: Request) {
  after(flushPostHogLogs);
  try {
    requireAdmin(request);
    logPostHogPipelineEvent("Scrape pipeline requested", { route: "/api/scrape", operation: "scrape" });
    const summary = await runScrape(await readScrapeOptions(request));
    logPostHogPipelineEvent("Scrape pipeline completed", {
      route: "/api/scrape",
      operation: "scrape",
      status: summary.status,
      sources_checked: summary.sources_checked,
      articles_inserted: summary.articles_inserted,
      articles_failed: summary.articles_failed,
    });
    return Response.json(summary, { status: summary.status === "failed" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
