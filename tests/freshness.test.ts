import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const id = (n: number) => `12345678-1234-4234-8234-${String(n).padStart(12, "0")}`;

test("database queue alternates across requests, backs off failures, fences claims and preserves pending semantics", async () => {
  const db = new PGlite();
  try {
    await db.exec("create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;");
    const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
    // PGlite here has no pgvector. Load the real table definitions, substituting
    // an array only for the existing embedding column; queue SQL tests NULL state only.
    const tables = schema.slice(schema.indexOf("create function public.valid_article_body"), schema.indexOf("create index sources_active_name_idx"));
    await db.exec(tables.replace("extensions.vector(1536)", "real[]"));
    await db.exec("grant select on all tables in schema public to service_role;");
    const upgrade = await readFile(new URL("../supabase/news-pipeline-freshness.sql", import.meta.url), "utf8");
    await db.exec(upgrade);
    await db.exec(upgrade); // Dashboard reapplication must preserve existing data.
    await db.query("insert into public.sources(id,name,listing_url) values ($1,'Queue fixture','https://example.com')", [id(99)]);
    for (let n = 1; n <= 6; n++) {
      await db.query(`insert into public.articles
        (id,source_id,original_url,canonical_url,title,image_url,published_at,raw_text,scraped_at,analyzed_at)
        values ($1,$2,$3,$3,'A meaningful fixture headline','https://example.com/photo.jpg',now(),$4,
          now() - $5::interval, now())`,
      [id(n), id(99), `https://example.com/article-${n}`, "Meaningful fixture sentence about the policy and its effects. ".repeat(30), n <= 3 ? `${n} minutes` : `${n} days`]);
    }
    await db.exec("set role service_role");
    const candidates = async (run: number, limit = 5, ids: string[] | null = null) => (await db.query<{ id: string; needs_analysis: boolean }>(
      "select * from public.get_analysis_candidates($1,$2,$3)", [id(run), limit, ids])).rows;
    const claim = async (article: string, run: number) => (await db.query<{ token: string | null }>(
      "select public.claim_article_analysis($1,$2) as token", [article, id(run)])).rows[0].token;
    const finish = async (article: string, token: string, success = false) => (await db.query<{ done: boolean }>(
      "select public.finish_article_analysis($1,$2,$3,$4) as done", [article, token, success, success ? null : "invalid_output_evidence"])).rows[0].done;

    assert.deepEqual((await candidates(100)).map(row => row.id), [id(1), id(6), id(2), id(5), id(3)]);
    assert.ok((await candidates(100)).every(row => row.needs_analysis), "stale analyzed_at cannot hide missing analysis");
    const first = (await candidates(100, 1))[0].id;
    const token = await claim(first, 100);
    assert.ok(token);
    assert.equal(await claim(first, 101), null, "overlapping callers cannot pay for the same work");
    assert.equal(await finish(first, id(999)), false, "non-owner cannot complete");
    assert.equal(await finish(first, token), true);
    assert.equal(await finish(first, token), false, "completion is one-time");
    assert.equal((await candidates(101, 1))[0].id, id(6), "next one-item request gives backlog its turn");
    assert.equal((await candidates(101, 100)).some(row => row.id === first), false, "failure is cooling down");
    const secondToken = await claim(id(6), 101);
    assert.ok(secondToken);
    await finish(id(6), secondToken);
    assert.equal((await candidates(102, 1))[0].id, id(2), "fresh lane progresses after an old failure");

    await db.query("update public.article_analysis_work set next_attempt_at = now() - interval '1 minute' where article_id = $1", [first]);
    assert.equal((await candidates(100, 100)).some(row => row.id === first), false, "never repeat within the same run");
    assert.equal((await candidates(102, 100)).at(-1)?.id, first, "an old failure cannot displace unattempted work in its lane");
    assert.deepEqual((await candidates(102, 5, [first])).map(row => row.id), [first]);
    const retryToken = await claim(first, 102);
    assert.ok(retryToken);
    assert.notEqual(retryToken, token);
    assert.equal(await finish(first, token), false, "stale worker is fenced after reclaim");
    await finish(first, retryToken);
    const state = (await db.query<{ failures: number; delay: number }>(
      "select failures, extract(epoch from next_attempt_at - now())::integer as delay from public.article_analysis_work where article_id=$1", [first])).rows[0];
    assert.equal(state.failures, 2);
    assert.ok(state.delay > 1750 && state.delay <= 1800, "second failure backs off for 30 minutes");
    await db.query("update public.article_analysis_work set failures=20,next_attempt_at=now()-interval '1 minute' where article_id=$1", [first]);
    const cappedToken = await claim(first, 103);
    assert.ok(cappedToken);
    await finish(first, cappedToken);
    const cap = (await db.query<{ delay: number }>("select extract(epoch from next_attempt_at-now())::integer as delay from public.article_analysis_work where article_id=$1", [first])).rows[0].delay;
    assert.ok(cap > 604750 && cap <= 604800, "backoff is capped at seven days");

    // Simulate a terminated worker: the next request can reclaim after expiry.
    const interrupted = await claim(id(2), 104);
    await db.query("update public.article_analysis_work set next_attempt_at=now()-interval '1 minute' where article_id=$1", [id(2)]);
    const recovered = await claim(id(2), 105);
    assert.ok(recovered && recovered !== interrupted);
    await finish(id(2), recovered, true);

    // Queue selection preserves embedding-only backfill and excludes completed rows.
    await db.exec("reset role");
    await db.query(`insert into public.article_analyses
      (article_id,summary,sentiment_score,sentiment_label,bias_label,left_percentage,center_percentage,right_percentage,confidence,framing_notes,loaded_terms,disclaimer,model)
      values ($1,'Neutral fixture summary',0,'neutral','center',10,80,10,0.8,array['Evidence'],array[]::text[],'AI estimate','fixture')`, [id(3)]);
    await db.exec("set role service_role");
    assert.equal((await candidates(106, 1, [id(3)]))[0].needs_analysis, false);
    await db.exec("reset role");
    await db.query("update public.article_analyses set embedding=array_fill(0.01::real,array[1536]) where article_id=$1", [id(3)]);
    await db.exec("set role service_role");
    assert.equal((await candidates(107, 1, [id(3)])).length, 0);
    assert.equal(await claim(id(3), 107), null);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(candidates(108));
      await assert.rejects(claim(first, 108));
      await assert.rejects(finish(first, token));
      await assert.rejects(db.query("select * from public.article_analysis_work"));
    }
  } finally { await db.close(); }
});
