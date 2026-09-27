import { z } from "zod";
import { ApiError, apiError, requireAdmin } from "@/lib/api/admin";
import { getScheduleRuns } from "@/lib/supabase/queries/schedules";

export const runtime = "nodejs";
const schema = z.object({ scheduleId: z.uuid(), limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) }).strict();
export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const options = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!options.success) throw new ApiError(400, "Invalid run filters.");
    return Response.json({ runs: await getScheduleRuns(options.data.scheduleId, options.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
