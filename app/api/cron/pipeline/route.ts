import { after } from "next/server";
import { flushPostHogLogs } from "@/instrumentation";
import { apiError } from "@/lib/api/admin";
import { requireCron } from "@/lib/api/cron";
import { runCronPipeline } from "@/lib/pipeline/cron";

export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  try {
    requireCron(request);
    after(flushPostHogLogs);
    const summary = await runCronPipeline();
    return Response.json(summary, { status: summary.status === "failed" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
