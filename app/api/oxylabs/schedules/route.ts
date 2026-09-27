import { z } from "zod";
import { ApiError, apiError, boundedText, requireAdmin } from "@/lib/api/admin";
import { getSchedules } from "@/lib/supabase/queries/schedules";
import { syncSchedules } from "@/lib/pipeline/schedules";
import { MAX_REQUEST_BYTES } from "@/lib/pipeline/limits";

export const runtime = "nodejs";
export const maxDuration = 300;
const paging = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) }).strict();
export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const options = paging.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!options.success) throw new ApiError(400, "Invalid schedule filters.");
    return Response.json({ schedules: await getSchedules(options.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try {
    requireAdmin(request);
    const body = await boundedText(request.body, MAX_REQUEST_BYTES);
    try { z.object({}).strict().parse(body.trim() ? JSON.parse(body) : {}); }
    catch { throw new ApiError(400, "Invalid schedule options."); }
    return Response.json(await syncSchedules(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
