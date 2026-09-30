import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { decodeProviderJson, SchedulerClient, type ProviderSchedule } from "../lib/scraping/oxylabs-scheduler";
import { requireCron } from "../lib/api/cron";
import { budgetSignal, remainingTime, withinBudget, withinRequestBudget, withoutBudget } from "../lib/pipeline/budget";
import { CRON_SCRAPING_BUDGET_MS, CRON_ANALYSIS_BUDGET_MS, SCHEDULED_PROCESSING_BUDGET_MS, SCHEDULER_REQUEST_BUDGET_MS } from "../lib/pipeline/limits";
import { reconcileSchedules, type ScheduleDependencies } from "../lib/pipeline/schedules";
import { processScheduledResults, type ProcessingDependencies } from "../lib/pipeline/scheduled-results";
import { executeCronPipeline } from "../lib/pipeline/cron";
import { runAnalysis } from "../lib/pipeline/analyze";
import { claimRetryableRun, finishScheduleRun } from "../lib/supabase/queries/schedules";
import { GET as cronGet, maxDuration as cronMaxDuration } from "../app/api/cron/pipeline/route";
import { GET as listGet, POST as syncPost } from "../app/api/oxylabs/schedules/route";
import { POST as processPost, maxDuration as processMaxDuration } from "../app/api/oxylabs/scheduled-results/process/route";
import { GET as runsGet } from "../app/api/oxylabs/runs/route";
import type { Log, Schedule, ScheduleRun, Source } from "../lib/supabase/types";

const id = (n: number) => `12345678-1234-4234-8234-${String(n).padStart(12, "0")}`;
const source: Source = { id: id(1), name: "BBC News", listing_url: "https://www.bbc.com/news", parser_strategy: "bbc", active: true, logo_url: null, created_at: "", updated_at: "" };
const remote: ProviderSchedule = { schedule_id: "9223372036854775807", active: true, items_count: 1, cron: "0 * * * *", end_time: "2032-01-01 00:00:00" };
const row: Schedule = { id: id(2), source_id: source.id, schedule_id: remote.schedule_id, state: "active", listing_url: source.listing_url, last_attempted_at: null, created_at: "", updated_at: "" };

test("scheduler routes and work phases fit Hobby with cleanup and response reserves", () => {
  assert.equal(cronMaxDuration, 300);
  assert.equal(processMaxDuration, 300);
  assert.ok(CRON_SCRAPING_BUDGET_MS < CRON_ANALYSIS_BUDGET_MS);
  assert.ok(CRON_ANALYSIS_BUDGET_MS <= SCHEDULER_REQUEST_BUDGET_MS - 50_000);
  assert.ok(SCHEDULED_PROCESSING_BUDGET_MS <= SCHEDULER_REQUEST_BUDGET_MS - 50_000);
  assert.ok(SCHEDULER_REQUEST_BUDGET_MS <= cronMaxDuration * 1000 - 30_000);
});

test("cleanup and nested pipeline calls cannot extend the request deadline", async t => {
  let now = 1_000;
  t.mock.method(Date, "now", () => now);
  await withinRequestBudget(1_300, () => withinBudget(1_100, async () => {
    assert.equal(remainingTime(), 100);
    now = 1_101;
    assert.throws(() => budgetSignal(30_000));
    await withoutBudget(async () => {
      assert.equal(remainingTime(), 199);
      await withinRequestBudget(9_000, async () => assert.equal(remainingTime(), 199));
      now = 1_301;
      assert.throws(() => budgetSignal(30_000));
    });
  }));
  assert.equal(remainingTime(), Infinity);
});

test("provider decoding preserves integer IDs and never changes quoted HTML/string content", () => {
  const result = decodeProviderJson('{"schedule_id":9223372036854775807,"runs":[{"run_id":9007199254740993,"jobs":[{"id":9223372036854775806,"result_status":"done"}]}],"items_count":1,"content":"{\\\"id\\\":9223372036854775807}"}') as { schedule_id: string; items_count: number; content: string; runs: { run_id: string; jobs: { id: string }[] }[] };
  assert.equal(result.schedule_id, "9223372036854775807");
  assert.equal(result.runs[0].run_id, "9007199254740993");
  assert.equal(result.runs[0].jobs[0].id, "9223372036854775806");
  assert.equal(result.items_count, 1);
  assert.equal(result.content, '{"id":9223372036854775807}');
});

test("transport uses exact IDs, done-job raw results, and supports empty state responses", async () => {
  process.env.OXY_WSA_USERNAME = "test"; process.env.OXY_WSA_PASSWORD = "test";
  const calls: string[] = [];
  const client = new SchedulerClient(async (input, options) => {
    const url = String(input); calls.push(url);
    assert.equal(options?.redirect, "error");
    if (url.endsWith("/state")) { assert.equal(options?.method, "PUT"); return new Response(null, { status: 202 }); }
    if (url.endsWith("/runs")) return new Response('{"runs":[{"run_id":9007199254740993,"jobs":[{"id":9223372036854775807,"result_status":"done","created_at":"2026-09-27 00:00:00"}]}]}');
    return Response.json({ results: [{ job_id: remote.schedule_id, content: "<html>story</html>", url: source.listing_url, status_code: 200, type: "raw" }] });
  });
  assert.equal((await client.runs(remote.schedule_id))[0].jobs[0].id, remote.schedule_id);
  assert.equal((await client.result(remote.schedule_id)).url, source.listing_url);
  await client.state(remote.schedule_id, false);
  assert.ok(calls.every(url => url.includes(remote.schedule_id)));
  assert.ok(calls[1].endsWith("/results?type=raw"));
});

function syncHarness() {
  const stored: Schedule[] = [];
  const provider = new SchedulerClient();
  const states: { id: string; active: boolean }[] = [];
  let creates = 0;
  provider.create = async () => { creates++; return remote; };
  provider.info = async () => remote;
  provider.state = async (id, active) => { states.push({ id, active }); };
  provider.list = async () => [remote.schedule_id, "9007199254740995"];
  const deps: ScheduleDependencies = {
    sources: async () => [source], schedules: async () => stored,
    save: async input => { const saved = { ...row, ...input }; stored.splice(0, stored.length, saved); return saved; }, provider,
  };
  return { deps, stored, states, creates: () => creates };
}
test("sync reuses stored configuration, replaces changed source URLs, and deactivates orphans", async () => {
  const h = syncHarness();
  assert.equal((await reconcileSchedules(h.deps)).created, 1);
  assert.equal((await reconcileSchedules(h.deps)).reused, 1);
  assert.equal(h.creates(), 1);
  assert.ok(h.states.some(state => state.id === "9007199254740995" && !state.active));
  h.stored[0].listing_url = "https://www.bbc.com/old";
  assert.equal((await reconcileSchedules(h.deps)).created, 1);
});
test("sync does not perform orphan cleanup after incomplete database enumeration", async () => {
  const h = syncHarness();
  h.deps.schedules = async () => { throw new Error("database unavailable"); };
  await assert.rejects(reconcileSchedules(h.deps));
  assert.equal(h.states.length, 0);
  assert.equal(h.creates(), 0);
});
test("failed persistence compensates a newly created schedule and reports partial failure", async () => {
  const h = syncHarness();
  h.deps.save = async () => { throw new Error("database write failed"); };
  const result = await reconcileSchedules(h.deps);
  assert.equal(result.status, "partial");
  assert.equal(result.failed, 1);
  assert.ok(h.states.some(state => state.id === remote.schedule_id && !state.active));
});

function processingHarness() {
  const provider = new SchedulerClient();
  let fetched = 0;
  let inserted = 0;
  const complete = new Set<string>();
  const claims: string[] = [];
  provider.runs = async () => [{ run_id: "9007199254740993", jobs: [
    { id: "1", result_status: "pending", created_at: "" }, { id: "2", result_status: "faulted", created_at: "" },
    { id: "3", result_status: "done", created_at: "" }, { id: "4", result_status: "done", created_at: "" },
  ] }];
  provider.result = async () => { fetched++; return { url: source.listing_url, html: '<a href="https://www.bbc.com/news/articles/c1234567890o"><h2>Specific news headline here</h2></a>' }; };
  const claim = (jobId: string): ScheduleRun => ({ id: id(5), schedule_id: row.id, external_run_id: "9007199254740993", job_id: jobId, status: "processing", started_at: "2026-09-27T00:00:00Z", completed_at: null, summary: {}, error_code: null });
  const deps: ProcessingDependencies = {
    sources: async () => [source], schedules: async () => [row], save: async () => row, provider,
    reconcile: async () => ({ status: "completed", created: 0, reused: 1, reactivated: 0, deactivated: 0, failed: 0, duration_ms: 0 }),
    markAttempt: async () => {},
    claim: async input => { claims.push(input.job_id); return complete.has(input.job_id) ? null : claim(input.job_id); },
    finish: async (_id, status, summary = {}, code, startedAt) => { assert.equal(startedAt, "2026-09-27T00:00:00Z"); if (status === "completed") complete.add(claims.at(-1)!); return { ...claim(claims.at(-1)!), status, summary, error_code: code ?? null }; },
    scrape: {
      sources: async () => [source], existing: async () => new Set(),
      insert: async article => { inserted++; return { status: "inserted", article: { ...article, id: id(7), scraped_at: "", analyzed_at: null } }; },
      fetch: async url => ({ url, html: `<h1>Council announces transport policy following public review</h1><meta property="article:published_time" content="2026-09-27T10:00:00Z"><meta property="og:image" content="https://example.com/photo.jpg"><article><div data-component="text-block"><p>${"Officials discussed a new policy at the meeting with residents and other representatives. ".repeat(20)}</p></div></article>` }),
      log: async input => ({ ...input, id: id(8) } as Log),
    },
  };
  return { deps, complete, claims, fetched: () => fetched, inserted: () => inserted };
}
test("only done jobs are fetched, insertion limit is shared across jobs, completed delivery skips", async () => {
  const h = processingHarness();
  const result = await processScheduledResults({ limitPerSource: 1 }, h.deps);
  assert.equal(h.fetched(), 1);
  assert.equal(h.inserted(), 1);
  assert.equal(result.jobs_deferred, 1);
  assert.equal(result.jobs_completed, 1);
  h.complete.add("4");
  await processScheduledResults({ limitPerSource: 1 }, h.deps);
  assert.equal(h.fetched(), 1);
});
test("deadline leaves jobs unclaimed; bad selections are rejected before sync", async () => {
  const h = processingHarness();
  const result = await withinBudget(Date.now() - 1, () => processScheduledResults({ limitPerSource: 5 }, h.deps));
  assert.equal(result.status, "partial");
  assert.equal(h.claims.length, 0);
  await assert.rejects(processScheduledResults({ limitPerSource: 5, sourceIds: [id(99)] }, h.deps));
});

test("persisted source order gives all five sources a turn across short invocations", async t => {
  let now = 1_000_000;
  t.mock.method(Date, "now", () => now);
  const h = processingHarness();
  const sources = Array.from({ length: 5 }, (_, i) => ({ ...source, id: id(20 + i), name: `Source ${i}` }));
  const schedules = sources.map((s, i) => ({ ...row, id: id(30 + i), source_id: s.id, schedule_id: String(50 + i) }));
  const visited: string[] = [];
  h.deps.sources = async () => sources;
  h.deps.schedules = async () => schedules;
  h.deps.markAttempt = async scheduleId => {
    const schedule = schedules.find(s => s.id === scheduleId)!;
    schedule.last_attempted_at = new Date(now).toISOString();
    visited.push(schedule.source_id);
  };
  h.deps.provider.runs = async () => { now += 45_000; return []; };
  for (let run = 0; run < 3; run++) {
    await withinBudget(now + 100_000, () => processScheduledResults({ limitPerSource: 5 }, h.deps));
  }
  assert.deepEqual(visited.slice(0, 5), sources.map(s => s.id));
  assert.equal(new Set(visited.slice(0, 5)).size, 5);
});
test("a result for an unrelated listing fails the claim without scraping details", async () => {
  const h = processingHarness();
  h.deps.provider.result = async () => ({ url: "https://www.bbc.com/sport", html: "wrong listing" });
  const result = await processScheduledResults({ limitPerSource: 5 }, h.deps);
  assert.equal(result.jobs_completed, 0);
  assert.ok(result.jobs_failed > 0);
  assert.equal(h.inserted(), 0);
});

test("Cron always calls analysis after a thrown processing error", async () => {
  let called = false;
  const result = await executeCronPipeline({
    process: async () => { throw new Error("provider failure"); },
    analyze: async () => { called = true; return runAnalysis({}, { pending: async () => [], claim: async () => null, finish: async () => {}, configure: () => {}, analyze: async () => { throw new Error(); }, embed: async () => [], save: async () => { throw new Error(); }, saveEmbedding: async () => { throw new Error(); }, log: async input => ({ ...input, id: id(8) } as Log) }); },
    log: async input => ({ ...input, id: id(8) } as Log),
  });
  assert.equal(called, true);
  assert.equal(result.status, "partial");
  assert.equal(result.analysis.status, "completed");
});

test("production authorization fails closed and manual admin keys do not authorize Cron", async () => {
  const original = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production", CRON_SECRET: "cron-test", BIASLY_ADMIN_SECRET: "admin-test" });
    for (const handler of [listGet, syncPost, processPost, runsGet, cronGet]) {
      assert.equal((await handler(new Request("http://localhost/api/test"))).status, 401);
    }
    assert.throws(() => requireCron(new Request("http://localhost", { headers: { "x-biasly-admin-secret": "admin-test" } })));
    requireCron(new Request("http://localhost", { headers: { authorization: "Bearer cron-test" } }));
    Object.assign(process.env, { NODE_ENV: "development" }); delete process.env.VERCEL; delete process.env.VERCEL_ENV;
    requireCron(new Request("http://localhost"));
    process.env.VERCEL_ENV = "preview";
    assert.throws(() => requireCron(new Request("http://localhost")));
  } finally { process.env = original; }
});

test("database upgrade provides exclusive leases, expiry recovery, owner fencing and private privileges", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role; create table public.oxylabs_schedules(id uuid primary key);");
    await db.exec(await readFile(new URL("../supabase/oxylabs-scheduler.sql", import.meta.url), "utf8"));
    await db.exec("set role service_role");
    const acquire = async (owner: string) => (await db.query<{ acquired: boolean }>("select public.acquire_pipeline_lease('scheduler', $1) as acquired", [owner])).rows[0].acquired;
    assert.equal(await acquire(id(1)), true);
    assert.equal(await acquire(id(2)), false);
    await db.query("select public.release_pipeline_lease('scheduler', $1)", [id(2)]);
    assert.equal(await acquire(id(2)), false);
    await db.exec("update public.pipeline_leases set expires_at = now() - interval '1 minute'");
    assert.equal(await acquire(id(2)), true);
    await db.query("select public.release_pipeline_lease('scheduler', $1)", [id(1)]);
    assert.equal(await acquire(id(3)), false);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query("select public.acquire_pipeline_lease('scheduler', $1)", [id(3)]));
    await assert.rejects(db.query("select * from public.pipeline_leases"));
  } finally { await db.close(); }
});

test("retry claim uses conditional ownership and completion fences the original worker", async () => {
  const oldFetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  const previous: ScheduleRun = { id: id(5), schedule_id: row.id, external_run_id: "1", job_id: "2", status: "processing", started_at: "2020-01-01T00:00:00Z", completed_at: null, error_code: null, summary: {} };
  const patches: URL[] = [];
  globalThis.fetch = async (input, options) => {
    if (options?.method === "POST") return Response.json({ code: "23505" }, { status: 409 });
    if (options?.method === "PATCH") { patches.push(new URL(String(input))); return Response.json(null); }
    return Response.json(previous);
  };
  try {
    assert.equal(await claimRetryableRun({ schedule_id: row.id, external_run_id: "1", job_id: "2" }), null);
    assert.equal(patches[0].searchParams.get("started_at"), `eq.${previous.started_at}`);
    assert.equal(patches[0].searchParams.get("status"), "eq.processing");
    await finishScheduleRun(previous.id, "completed", {}, undefined, previous.started_at);
    assert.equal(patches[1].searchParams.get("started_at"), `eq.${previous.started_at}`);
  } finally { globalThis.fetch = oldFetch; }
});
