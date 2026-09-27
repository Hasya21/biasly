import { after } from "next/server";
import { flushPostHogLogs } from "@/instrumentation";
import { apiError, requireAdmin } from "@/lib/api/admin";
import { readScrapeOptions } from "@/lib/pipeline/scrape";
import { runScheduledResults } from "@/lib/pipeline/scheduled-results";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const options = await readScrapeOptions(request);
    after(flushPostHogLogs);
    const summary = await runScheduledResults(options);
    return Response.json(summary, { status: summary.status === "failed" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
