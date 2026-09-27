/** Approved source configuration; reruns preserve every existing source setting. */
import { getSupabaseAdmin } from "../lib/supabase/server";
import { saveSource } from "../lib/supabase/queries/sources";
import { checkError } from "../lib/supabase/validation";

const additions = [
  { name: "NPR", listing_url: "https://www.npr.org/sections/news/", parser_strategy: "npr" },
  { name: "Reuters", listing_url: "https://www.reuters.com/", parser_strategy: "reuters" },
  { name: "AP News", listing_url: "https://apnews.com/", parser_strategy: "ap" },
];
async function main() {
  const db = getSupabaseAdmin();
  for (const input of additions) {
    const { data, error } = await db.from("sources").select("*").eq("listing_url", input.listing_url).maybeSingle();
    checkError(error, "inspect source configuration");
    const row = data ?? await saveSource({ ...input, active: true });
    console.log({ id: row.id, name: row.name, listing_url: row.listing_url, parser_strategy: row.parser_strategy, active: row.active, action: data ? "preserved" : "inserted" });
  }
}
main().catch(() => { console.error("Source setup failed; existing rows were preserved."); process.exitCode = 1; });
