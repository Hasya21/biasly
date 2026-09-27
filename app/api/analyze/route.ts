import { after } from "next/server";
import { flushPostHogLogs, logPostHogPipelineEvent } from "@/instrumentation";
import { apiError, requireAdmin } from "@/lib/api/admin";
import { readAnalysisOptions, runAnalysis } from "@/lib/pipeline/analyze";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const options = await readAnalysisOptions(request);
    after(flushPostHogLogs);
    logPostHogPipelineEvent("Analysis pipeline requested", { route: "/api/analyze", operation: "analysis" });
    const summary = await runAnalysis(options);
    logPostHogPipelineEvent("Analysis pipeline completed", {
      route: "/api/analyze",
      operation: "analysis",
      status: summary.status,
      attempted: summary.attempted,
      analyzed: summary.analyzed,
      failed: summary.failed,
    });
    return Response.json(summary, { status: summary.status === "failed" ? 502 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
