# AI analysis verification — 2026-09-24

Implemented the approved `prompts/ai-analysis.md` using the existing Supabase schema and RPCs. No schema migration, public grants, embeddings or scheduler changes were needed. Dependencies installed: ai 7.0.113 and @ai-sdk/openai 4.0.74. Install reported zero vulnerabilities. Existing unrelated work was preserved.

## Checks

Commands were invoked with `npm.cmd` because this Windows shell blocks npm.ps1 under its execution policy. All checks below exited 0. Typecheck and lint were repeated after adding the verification scripts and also exited 0.

Exact typecheck output:
```text
> skewed_news@0.1.0 typecheck
> tsc --noEmit
```

Exact lint output:
```text
> skewed_news@0.1.0 lint
> eslint
```

`npm.cmd run test:analysis` passed all seven tests. Exact test-runner summary (verbose pipeline fixture logs omitted):
```text
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 37070.4524
```

Tests cover output consistency/evidence, invalid output retry cap, invalid/oversized input, transport failure, fatal quota errors, more than two batches, failed-row cursor advancement, selection/limit handling, missing-analysis selection despite an existing timestamp, empty runs, persistence failures, safe logs, logging failure preservation, admin authorization, invalid/oversized request bodies, and bounded batch configuration.

`npm.cmd run test:data` exact result summary:
```text
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 5889.9388
```

`npm.cmd run test:db` exact output:
```text
> skewed_news@0.1.0 test:db
> node scripts/test-database.mjs

PASS: database constraints, dedupe, pending cursors, atomic analysis, IDs, RLS, and service permissions; fixtures rolled back
PASS: isolated PostgreSQL schema loaded; all six tables empty after verification.
Note: PGlite is single-connection; multi-session lock contention requires hosted/local PostgreSQL verification.
```

`npm.cmd run build` exited 0. Exact build result lines:
```text
✓ Compiled successfully in 13.8s
  Finished TypeScript in 24.3s ...
✓ Generating static pages using 7 workers (9/9) in 2.5s
```

The route table includes `ƒ /api/analyze`. Next.js emitted an existing workspace warning that it ignored `C:\Users\Dell\package-lock.json` outside this Git repository; no configuration was changed for that unrelated warning.

## Live verification

Command:
```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-analysis.ts
```

The existing pending-selection RPC returned one selected pending article. Exactly one article was analyzed and saved in 11,248 ms, with zero failures, skips or logging failures. Its repeat run attempted zero articles. Exact concluding output:
```text
PASS: article da120eff-62eb-46de-90f3-84233f6f4d8a; atomic save, percentages, bias score, publication query and repeat-run skip verified. Model: gpt-5.4-mini-2026-03-17
```

Live analysis run ID: `6e76c476-0235-4f46-8af8-396a81134f83`. Read-back assertions verified exactly one analysis row, percentages totaling 100, correct derived bias score, fixed disclaimer, exclusion from pending selection, and availability through the published detail query. The rest of the paid backlog was not processed.

## Production HTTP verification

Started `npm.cmd run start -- --port 3011` because port 3000 was already occupied. The initial sandboxed server could not reach Supabase; restarting this temporary server with network access resolved that environmental failure. An initial inline Node command also failed due to Windows quoting; the committed verification script avoids inline quoting.

Command:
```powershell
node --env-file=.env.local --import tsx scripts/verify-analysis-http.ts http://localhost:3011 da120eff-62eb-46de-90f3-84233f6f4d8a
```

Exact successful output:
```text
PASS: published story rendered on homepage
GET /api/analyze: 405
POST /api/analyze: 401
POST /api/analyze: 400
POST /api/analyze: 200
PASS: authenticated repeat request skipped stored analysis
```

The temporary verification server was stopped after testing. No existing server was stopped. The Clerk-authenticated detail-page visual check remains a manual step; the protected data query was verified, but no user sign-in was automated.

## Limits and manual use

See README.md's AI article analysis section for exact curl commands. Start `npm.cmd run dev`, supply the existing admin header, and watch its terminal for batch progress. `{}` processes all pending articles; `{"limit":1}` caps attempts; `articleIds` restricts selection. Hosting timeouts apply to the complete synchronous request. Concurrent invocations can duplicate provider spend, although database persistence remains idempotent. Failed/skipped articles remain eligible for later runs.

Documentation reviewed: installed Next.js route guide, installed AI SDK structured-output/reference docs and OpenAI provider source, current model catalog, Supabase RPC reference and changelog. No applicable breaking change was found for the existing RPC usage. Supabase observability guidance was consulted during network verification.
