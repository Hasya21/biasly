# Oxylabs Scheduler verification — 2026-09-27

## Implemented

- Hourly Oxylabs schedule synchronization and renewal; stored schedule/run status routes.
- Done-only scheduled homepage processing through the existing scraper, five insertions per active source per invocation.
- Exact string IDs, orphan cleanup, private operational routes, conditional job claims/retries, distributed leases and runtime deadlines.
- Vercel Cron at minute 15, followed by analysis even if processing fails. Existing embeddings/backfill behavior is preserved.
- SQL upgrade, deployment/test documentation and a repeatable hosted verification script.

The user approved `prompts/oxylabs-scheduler.md` and confirmed applying `supabase/oxylabs-scheduler.sql`. All five active sources were selected by the user.

## Checks

PowerShell blocks `npm.ps1` on this computer, so checks used `npm.cmd`, running the same package scripts.

| Command | Result |
| --- | --- |
| `npm.cmd run typecheck` | Exit 0; no TypeScript diagnostics |
| `npm.cmd run lint` | Exit 0; no ESLint diagnostics |
| `npm.cmd run build` | Exit 0; all new routes included |
| `npm.cmd run test:data` | 3 passed, 0 failed |
| `npm.cmd run test:scraping` | 8 passed, 0 failed |
| `npm.cmd run test:analysis` | 9 passed, 0 failed |
| `npm.cmd run test:scheduler` | 12 passed, 0 failed |
| `git diff --check` | Exit 0; existing Windows line-ending warnings only |

Exact successful compiler/linter output:

```text
> skewed_news@0.1.0 typecheck
> tsc --noEmit

> skewed_news@0.1.0 lint
> eslint
```

Successful production build output:

```text
▲ Next.js 16.3.4 (Turbopack)
- Environments: .env.local
⚠ Warning: Next.js ignored package-lock.json in C:\Users\Dell because it is outside the current Git repository (C:\Users\Dell\Desktop\Projects\skewed_news).
 To use this directory, set `turbopack.root` in your Next.js config.

✓ Running next.config.ts took 196ms

  Creating an optimized production build ...
✓ Compiled successfully in 8.2s
  Running TypeScript ...
  Finished TypeScript in 28.3s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/13) ...
  Generating static pages using 7 workers (3/13)
  Generating static pages using 7 workers (6/13)
  Generating static pages using 7 workers (9/13)
✓ Generating static pages using 7 workers (13/13) in 3.4s
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /api/analyze
├ ƒ /api/cron/pipeline
├ ƒ /api/logs
├ ƒ /api/oxylabs/runs
├ ƒ /api/oxylabs/scheduled-results/process
├ ƒ /api/oxylabs/schedules
├ ƒ /api/scrape
├ ƒ /api/sources
├ ○ /design-system
├ ƒ /news/[id]
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]

ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

The initial test fixture had an optional summary type error; fixed and typecheck/build rerun successfully. The existing analysis route registered `after()` before authorization/validation, causing its direct route test to throw outside a Next request scope. Cleanup registration now follows successful authorization/input validation; all nine analysis tests pass. Offline test imports print pre-existing missing PostHog configuration messages because these tests do not load real environment credentials; no tests make paid API calls.

## Hosted verification and activation

Executed:

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-scheduler.ts --activate --process
```

Result: exit 0. Verified the added column, exclusive hosted lease, prevention of release by a different owner, and anonymous RPC denial. Source names were loaded from Supabase.

```text
PASS: hosted upgrade, exclusive lease, owner fencing, anonymous RPC denial
Active sources: [ 'AP News', 'BBC News', 'NPR', 'Reuters', 'The Guardian' ]
First sync: {
  status: 'completed',
  created: 5,
  reused: 0,
  reactivated: 0,
  deactivated: 0,
  failed: 0,
  duration_ms: 5685
}
Repeat sync: {
  status: 'completed',
  created: 0,
  reused: 5,
  reactivated: 0,
  deactivated: 0,
  failed: 0,
  duration_ms: 3770
}
PASS: repeated sync preserves exact schedule IDs
```

| Source | Exact active provider schedule ID |
| --- | --- |
| AP News | `3799622819986961747` |
| BBC News | `281292664797876641` |
| NPR | `2451798172679820561` |
| Reuters | `2084467568837037572` |
| The Guardian | `2221276256344645580` |

All five provider records were active with one job and cron `0 * * * *`. Each stored URL matched its active source. The processing invocation `9f4beb96-a656-4530-a35f-9157355552aa` completed in 5,889 ms: five sources checked, zero completed jobs available, zero inserts, zero failures, zero logging failures. This verifies the live empty-run path; it does not establish successful scheduled article ingestion yet. The existing analysis pipeline was exercised by regression tests, not a full paid backlog run during this implementation.

## Deployment state and exact next test

Oxylabs schedules are active and run independently of the dev server. Vercel deployment has not been performed. Production requires a Pro/Enterprise project, existing server environment variables, and a generated `CRON_SECRET` configured in Vercel. Deploy the reviewed app with `vercel.json`, confirm the minute-15 trigger in Vercel, and observe its first real invocation. The app never creates or stores the Cron secret locally.

For local end-to-end verification after the first hourly Oxylabs completion:

```powershell
# Terminal 1: watch the scheduler/scrape/analysis logs here.
npm.cmd run dev

# Terminal 2: local development only, no Cron secret required.
curl.exe -i http://localhost:3000/api/cron/pipeline
```

To inspect or process jobs individually, set `$env:BIASLY_ADMIN_SECRET` to the existing secret in the calling terminal:

```powershell
curl.exe -i http://localhost:3000/api/oxylabs/schedules -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
curl.exe -i -X POST http://localhost:3000/api/oxylabs/schedules -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H "Content-Type: application/json" --data-raw '{}'
curl.exe -i -X POST http://localhost:3000/api/oxylabs/scheduled-results/process -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H "Content-Type: application/json" --data-raw '{}'
$scheduleRowId = 'REPLACE_WITH_INTERNAL_SCHEDULE_UUID'
curl.exe -i "http://localhost:3000/api/oxylabs/runs?scheduleId=$scheduleRowId&limit=20" -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
curl.exe -i http://localhost:3000/api/logs -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
curl.exe -i -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H "Content-Type: application/json" --data-raw '{}'
```

The internal schedule UUID comes from the first GET response and differs from the numeric provider ID above. Repeating processing must skip completed jobs; failed jobs can retry without replacing articles. Refresh `/` and open an analyzed article to confirm stored analysis/embedding publication. All manual action/status routes reject missing/wrong admin headers with 401. In production, an unauthenticated Cron request must return 401; use Vercel's Cron controls to invoke it with its configured secret.
