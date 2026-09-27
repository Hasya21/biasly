import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { budgetSignal } from "../pipeline/budget";

let client: SupabaseClient<Database> | undefined;

/** Internal privileged client. Callers must enforce route/user authorization. */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL and service-role key must be configured on the server.");
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Invalid Supabase URL configuration."); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("Invalid Supabase URL configuration.");
  }
  client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: init?.signal ? AbortSignal.any([init.signal, budgetSignal(30_000)]) : budgetSignal(30_000) }) },
  });
  return client;
}
