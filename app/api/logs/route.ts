import { z } from "zod";
import { ApiError, apiError, requireAdmin } from "@/lib/api/admin";
import { getLogs } from "@/lib/supabase/queries/logs";

export const runtime = "nodejs";
const schema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0), runId: z.uuid().optional() }).strict();
export async function GET(request: Request) {
  try {
    requireAdmin(request);
    const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new ApiError(400, "Invalid log filters.");
    return Response.json({ logs: await getLogs(parsed.data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
