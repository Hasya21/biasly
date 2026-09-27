import "server-only";
import { getSupabaseAdmin } from "../server";
import type { NewSource, Source } from "../types";
import { checkError, httpUrl, pageBounds, requiredText, uuid } from "../validation";

export async function getActiveSources(options: { ids?: string[]; limit?: number; offset?: number } = {}): Promise<Source[]> {
  const { limit, offset } = pageBounds(options.limit ?? 100, options.offset);
  if (options.ids?.length === 0) return [];
  let query = getSupabaseAdmin().from("sources").select("*").eq("active", true);
  if (options.ids) query = query.in("id", options.ids.map(uuid));
  const { data, error } = await query.order("name").order("id").range(offset, offset + limit - 1);
  checkError(error, "read active sources");
  return data ?? [];
}

/** Explicit administration helper; never called by a reader-facing UI. */
export async function saveSource(input: NewSource, id?: string): Promise<Source> {
  if (input.active !== undefined && typeof input.active !== "boolean") throw new Error("Invalid source active flag.");
  const row: NewSource = {
    name: requiredText(input.name, "Source name"), listing_url: httpUrl(input.listing_url),
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(input.parser_strategy !== undefined ? { parser_strategy: input.parser_strategy === null ? null : requiredText(input.parser_strategy, "Parser strategy") } : {}),
    ...(input.logo_url !== undefined ? { logo_url: input.logo_url === null ? null : httpUrl(input.logo_url) } : {}),
  };
  const table = getSupabaseAdmin().from("sources");
  const query = id ? table.update(row).eq("id", uuid(id)) : table.insert(row);
  const { data, error } = await query.select("*").single();
  checkError(error, "save source");
  if (!data) throw new Error("Source save returned no row.");
  return data;
}
