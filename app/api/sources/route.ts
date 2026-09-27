import { apiError } from "@/lib/api/admin";
import { allActiveSources } from "@/lib/pipeline/scrape";

export const runtime = "nodejs";
export async function GET() {
  try {
    return Response.json({ sources: (await allActiveSources()).map(({ id, name, listing_url, logo_url }) => ({ id, name, listing_url, logo_url })) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
