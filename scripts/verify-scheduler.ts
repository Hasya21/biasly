import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "../lib/supabase/server";
import { allActiveSources } from "../lib/pipeline/scrape";
import { syncSchedules } from "../lib/pipeline/schedules";
import { allSchedules } from "../lib/supabase/queries/schedules";
import { runScheduledResults } from "../lib/pipeline/scheduled-results";
import { SchedulerClient } from "../lib/scraping/oxylabs-scheduler";

async function main() {
  const db = getSupabaseAdmin();
  const schema = await db.from("oxylabs_schedules").select("listing_url").limit(1);
  assert.equal(schema.error, null, "Apply supabase/oxylabs-scheduler.sql first.");
  const firstOwner = randomUUID();
  const secondOwner = randomUUID();
  const acquire = (owner: string) => db.rpc("acquire_pipeline_lease", { p_name: "scheduler", p_owner: owner });
  const first = await acquire(firstOwner);
  assert.equal(first.error, null);
  assert.equal(first.data, true, "A scheduler is already running; retry after it finishes.");
  try {
    assert.equal((await acquire(secondOwner)).data, false);
    await db.rpc("release_pipeline_lease", { p_name: "scheduler", p_owner: secondOwner });
    assert.equal((await acquire(secondOwner)).data, false);
  } finally { await db.rpc("release_pipeline_lease", { p_name: "scheduler", p_owner: firstOwner }); }
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }) } });
  assert.ok((await anon.rpc("acquire_pipeline_lease", { p_name: "scheduler", p_owner: secondOwner })).error, "Anonymous lease access must be denied.");
  console.info("PASS: hosted upgrade, exclusive lease, owner fencing, anonymous RPC denial");
  const sources = await allActiveSources();
  console.info("Active sources:", sources.map(source => source.name));
  if (process.argv.includes("--activate")) {
    console.info("First sync:", await syncSchedules());
    const first = (await allSchedules()).map(row => row.schedule_id);
    console.info("Repeat sync:", await syncSchedules());
    assert.deepEqual((await allSchedules()).map(row => row.schedule_id), first);
    console.info("PASS: repeated sync preserves exact schedule IDs");
  }
  const provider = new SchedulerClient();
  const rows = await allSchedules();
  for (const source of sources) {
    const row = rows.find(row => row.source_id === source.id);
    assert.ok(row, `Missing schedule for ${source.name}`);
    const info = await provider.info(row.schedule_id);
    assert.ok(info?.active);
    assert.equal(info.schedule_id, row.schedule_id);
    assert.equal(info.cron, "0 * * * *");
    assert.equal(info.items_count, 1);
    assert.equal(row.listing_url, source.listing_url);
    const runs = await provider.runs(row.schedule_id);
    console.info("Verified:", { source: source.name, schedule_id: row.schedule_id, completed_jobs: runs.flatMap(run => run.jobs).filter(job => job.result_status === "done").length });
  }
  if (process.argv.includes("--process")) console.info("Processing:", await runScheduledResults({ limitPerSource: 5 }));
}
main().catch(() => { console.error("Scheduler verification failed. Check schema installation, configuration, or active leases; raw credentials/provider errors are omitted."); process.exitCode = 1; });
