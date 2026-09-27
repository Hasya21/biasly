import "server-only";
import { randomUUID } from "node:crypto";
import { ApiError } from "../api/admin";
import { getSupabaseAdmin } from "../supabase/server";
import { checkError } from "../supabase/validation";
import { withoutBudget } from "./budget";

export async function withPipelineLease<T>(name: "scheduler" | "hourly_pipeline", work: () => Promise<T>): Promise<T> {
  const owner = randomUUID();
  const { data, error } = await getSupabaseAdmin().rpc("acquire_pipeline_lease", { p_name: name, p_owner: owner });
  checkError(error, "acquire pipeline lease");
  if (!data) throw new ApiError(409, "Pipeline already running. Retry later.");
  try { return await work(); }
  finally {
    await withoutBudget(async () => {
      try {
        const result = await getSupabaseAdmin().rpc("release_pipeline_lease", { p_name: name, p_owner: owner });
        if (result.error) console.warn("[pipeline] lease release failed; expires automatically");
      } catch { console.warn("[pipeline] lease release failed; expires automatically"); }
    });
  }
}
