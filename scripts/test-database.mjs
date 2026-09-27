import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
  await db.exec(await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"));
  const results = await db.exec(await readFile(new URL("../supabase/verify.sql", import.meta.url), "utf8"));
  console.log(results.at(-1).rows[0].result);
  for (const table of ["sources", "articles", "article_analyses", "logs", "oxylabs_schedules", "oxylabs_schedule_runs"]) {
    const result = await db.query(`select count(*)::integer as count from public.${table}`);
    assert.equal(result.rows[0].count, 0, `Verification must roll back ${table}`);
  }
  console.log("PASS: isolated PostgreSQL schema loaded; all six tables empty after verification.");
  console.log("Note: PGlite is single-connection; multi-session lock contention requires hosted/local PostgreSQL verification.");
} finally {
  await db.close();
}
