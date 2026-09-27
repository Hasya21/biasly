# Oxylabs Scheduler and automatic hourly Vercel pipeline

## Goal

Implement the complete hourly workflow: Oxylabs collects each active stored source entry page at minute 00; Vercel calls the protected pipeline at minute 15 to process completed homepage jobs, insert valid articles, and run existing AI analysis and embedding generation. Deliver schedule synchronization, stored schedule/run status routes, manual processing, Cron configuration, tests, and deployment instructions together.

Status: approved by the user with “Implement it”; implemented. See `prompts/oxylabs-scheduler-verification.md` for checks and live/deployment state.

## Deployment compatibility correction — 2026-09-27

The user's deployment failure identifies Vercel Hobby (300-second maximum). The working tree now has a user-modified daily Cron expression, `15 0 * * *`; preserve it. This is a correction to the approved scheduler's deployment/runtime handling, not a new provider configuration change.

- Goal: remove invalid 800-second route exports and keep processing/cleanup inside Hobby's execution limit.
- Guidance/code inspected: installed Next.js maxDuration guide, current Vercel duration/Cron docs, `lib/pipeline/{budget,lease,cron,scheduled-results,schedules,limits}.ts`, both affected route files, scheduler tests and project memory. Reuse previously read skills; no schema, provider or AI output changes.
- Change the two 800-second route exports to literal 300. Reduce Cron processing to 100 seconds, analysis to an absolute 220-second work deadline, and standalone processing to 220 seconds. Bound the complete scheduler request (including leases and final writes) to 270 seconds, leaving 30 seconds before platform termination. Cleanup may exceed a work-phase deadline but must not bypass the request deadline.
- Preserve the user's daily Vercel schedule, existing hourly Oxylabs schedules, secret checks, insertion limits, claims and pending-work recovery. Do not upgrade the plan, deploy, rotate secrets or change live schedules.
- Files likely to change: the two route exports, shared pipeline limits/budget, lease cleanup, Cron/scheduled-results/sync entrypoints, regression tests, README and project memory.
- Acceptance: all exported route durations are Hobby-compatible; nested cleanup respects the request deadline; phase failure still permits analysis; daily scheduling is documented honestly; no secrets from pasted output are copied into code/docs.
- Checks: typecheck, lint, build, scheduler regression suite, and inspect generated Next route configuration for maxDuration 300. Preserve existing tests and add focused coverage for the shared deadline boundary.
- Manual test: redeploy on Hobby; confirm the maxDuration error is gone; run `npm.cmd run dev`, then `curl.exe -i http://localhost:3000/api/cron/pipeline` and watch terminal logs. Existing admin POST/status curl commands below remain valid. On production, the unauthenticated Cron URL must return 401. The user's existing daily expression is nominally 00:15 UTC, subject to Hobby's scheduling precision.

## Skills and guidance read

- `AGENTS.md` and `PROJECT_MEMORY.md`.
- `.agents/skills/web-scraper-api/SKILL.md`, explicitly requested by the user (the requested skill name takes precedence over the older Oxylabs skill name in AGENTS.md).
- `.agents/skills/supabase/SKILL.md`.
- `.agents/skills/ai-sdk/SKILL.md`, for integration with the existing analysis pipeline. Preserve installed SDK/provider APIs and models.
- Installed Next.js guides: `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `01-app/03-api-reference/03-file-conventions/02-route-segment-config/maxDuration.md`.
- Current [Oxylabs Scheduler documentation](https://developers.oxylabs.io/products/web-scraper-api/features/scheduler).
- Current [Vercel Cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs), [Cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), and [function duration](https://vercel.com/docs/functions/configuring-functions/duration).
- Supabase changelog and [upsert reference](https://supabase.com/docs/reference/javascript/upsert). Recheck relevant documentation before implementing additional database behavior.

## Existing code inspected

- `lib/pipeline/scrape.ts`: `allActiveSources`, request validation, typed summaries, and reusable `processHomepage`.
- `lib/pipeline/limits.ts`, `lib/scraping/oxylabs.ts`: bounded responses, provider timeouts, safe error categories, universal HTML scraping.
- `lib/pipeline/analyze.ts`, `lib/ai/analyze-article.ts`, `lib/ai/embed-article.ts`: pending batches, analysis, embedding backfill, provider failures and safe persistence.
- `lib/supabase/queries/schedules.ts`: schedule upsert/list, unique job claim, completion and history helpers.
- `lib/supabase/queries/sources.ts`, `lib/supabase/queries/logs.ts`, `lib/supabase/types.ts`, `supabase/schema.sql`.
- `lib/api/admin.ts`, existing scrape/analyze/log routes, `proxy.ts`, `.env.example`, `package.json`, scheduler-related portions of `tests/supabase.test.ts`.
- Read-only live Supabase inspection: five active sources; `oxylabs_schedules` and `oxylabs_schedule_runs` are currently empty.

## Decisions and assumptions

1. User selected all five active sources and up to five new valid articles per source per hourly processing cycle. Current source names are AP News, BBC News, NPR, Reuters, and The Guardian. Always load their IDs, entry URLs, parser strategies, and active state from Supabase at runtime; do not hardcode them into the implementation.
2. NPR's stored `/sections/news/` entry page is explicitly authorized by project memory. Preserve it; do not discover additional listing pages.
3. Oxylabs cron is `0 * * * *`; Vercel cron is `15 * * * *` in UTC. Five articles is an insertion ceiling, not a minimum. When catching up multiple homepage jobs, enforce the per-source insertion ceiling across the invocation.
4. Use the existing schema and service-role query layer wherever possible. External IDs remain exact decimal strings, internal IDs remain UUIDs. No UI or authentication redesign is required.
5. Oxylabs requires an `end_time`. Use a centralized one-year schedule lifetime and replace schedules approaching expiry during automatic reconciliation, so continued operation does not require annual manual renewal. Document this choice.
6. Vercel hourly Cron requires Pro or Enterprise. Use Node.js routes with an explicit supported duration, initially 800 seconds for processing/Cron under Fluid Compute. Do not silently change to daily scheduling for Hobby.
7. The operator must set a production `CRON_SECRET` in Vercel. Vercel sends its value as a Bearer authorization header; it does not generate the secret for the project. Never add it to `.env.local`.
8. Approval authorizes implementing and checking this prompt. Distinguish code verification, live schedule activation, and production deployment in the completion report; never claim automatic production operation until both external setup steps are verified. Do not deploy an unrelated dirty working tree.

## Files likely to change

- New `lib/scraping/oxylabs-scheduler.ts` for provider transport, ID-safe decoding and payload validation.
- New small server-only modules under `lib/pipeline/` for schedule synchronization, scheduled result processing and Cron orchestration.
- New `lib/api/cron.ts` for production Cron authorization.
- New `app/api/oxylabs/schedules/route.ts` (GET/POST).
- New `app/api/oxylabs/scheduled-results/process/route.ts` (POST).
- New `app/api/oxylabs/runs/route.ts` (GET).
- New `app/api/cron/pipeline/route.ts` (GET).
- New `vercel.json` with the hourly Cron registration.
- Narrow updates to `lib/pipeline/scrape.ts`, `lib/pipeline/analyze.ts`, and `lib/pipeline/limits.ts` for reusable orchestration and execution deadlines, preserving manual defaults.
- `lib/supabase/queries/schedules.ts`, `lib/supabase/queries/logs.ts`, and associated types for safe claims, retries and scheduler counters.
- Tests and an npm scheduler test command; `README.md`, `PROJECT_MEMORY.md`, and a verification report under `prompts/`.
- `.env.example` comments if setup needs clarification. Keep the AGENTS.md environment list consistent if any variable changes.
- Database changes are not expected. If a necessary schema change emerges, keep it narrowly scoped, synchronize `supabase/schema.sql` and types, supply an existing-project SQL upgrade and apply it before live tests. Follow the Supabase schema workflow and required database guidance first.

## Implementation requirements

### Provider transport

- Use authenticated fixed-origin `https://data.oxylabs.io/v1` endpoints. Verify current job-result retrieval documentation before implementing the result fetch.
- Implement POST `/schedules`, GET `/schedules`, GET `/schedules/{id}`, GET `/schedules/{id}/runs`, and PUT `/schedules/{id}/state` with `{ active: boolean }`.
- Create one `universal` HTML job per stored entry URL; no category discovery and no article detail jobs inside the hourly schedule.
- Extract numeric `schedule_id`, `run_id`, and job `id` tokens from raw response text before ordinary JSON parsing. Use a string-aware decoder; do not rewrite digits inside string content. Validate strings as decimal identifiers. Never convert parsed unsafe numbers to strings. Include fixtures beyond `Number.MAX_SAFE_INTEGER`.
- Validate all provider response shapes, use bounded response sizes and timeouts, and reject unsafe redirects. Accept the documented empty/null 202 response when changing schedule state.
- Stop on credential/access failures. Avoid blind retries of schedule creation after uncertain responses, which could create duplicate recurring schedules. Keep provider payloads and secrets out of errors/logs.

### Schedule synchronization

- `POST /api/oxylabs/schedules`, admin header required, empty body or `{}`: reconcile all active sources with stored/provider schedules.
- Reuse valid schedules instead of recreating them each invocation. Reactivate valid inactive schedules; replace missing, expired, or incompatible schedules using documented APIs. Deactivate schedules for inactive sources.
- Handle source entry URL changes so future jobs follow current Supabase configuration; never silently process an obsolete listing. Use the smallest reliable persisted comparison available, adding configuration metadata only if necessary.
- After creation and persistence, list all provider schedule IDs, compare with the complete paginated stored set, and deactivate IDs absent from Supabase as required by AGENTS.md. This reconciliation treats the configured Oxylabs account's schedules as owned by this application; document that behavior explicitly.
- Never deactivate based on incomplete/failed database enumeration. Handle creation/persistence failures with compensation where possible, and preserve explicit partial failures.
- Account for concurrent synchronization so a duplicate creation cannot silently overwrite the winning mapping or deactivate a newly persisted schedule. Re-read current mappings before orphan cleanup.
- Return safe typed counts for created, reused/reactivated, deactivated, failed, and duration.

### Scheduled homepage processing

- `POST /api/oxylabs/scheduled-results/process`, admin header required. Accept existing-style `sourceIds` and `limitPerSource` options; defaults are all active sources and five valid insertions each. Reject invalid/inactive selections and unknown fields.
- Reconcile schedules before processing. Get job status exclusively from `/runs`; do not use `/jobs` for status detection. Fetch result bodies only for `result_status === 'done'`.
- Claim jobs in Supabase before article work using the unique `job_id`. Skip completed jobs and jobs held by a live worker. Support bounded retry/reclaim of failed or stale interrupted claims with an atomic conditional update and an ownership check on completion. Do not let an old worker finish a newer worker's claim.
- Leave work not started due to a deadline or exhausted per-source budget eligible for a subsequent invocation. Do not falsely mark unprocessed work completed.
- Validate that scheduled result metadata corresponds to the configured source entry page. Reuse `processHomepage` for story-card extraction, candidate URL gates, 15-URL dedupe chunks, detail fetches, text cleanup, image/date/body validation, and append-only inserts.
- Never save homepage HTML as an article. Preserve all source parser behavior and URL/content gates.
- Record job outcomes, safe error codes, and counters. A job with recoverable detail failures must not be reported as fully successful; retries remain dedupe-safe.
- Produce the same scrape summary counters plus scheduler-specific job counts. Console logs and Supabase logs must make source errors, skipped/retried jobs, inserts, rejection counts, and overall status understandable.

### Cron orchestration and runtime bounds

- `GET /api/cron/pipeline` is the sole GET action exception. Outside local development require `Authorization: Bearer <CRON_SECRET>` and reject missing configuration or invalid credentials with 401 before any work. The admin secret does not authorize Cron.
- Bypass the secret only in local `NODE_ENV === 'development'` with no deployed Vercel environment. Preview/production must fail closed. No browser trigger or public UI control.
- Register exactly one `vercel.json` cron: `/api/cron/pipeline` at `15 * * * *`.
- Call server functions directly: first scheduled result processing, then existing analysis. Analysis must still execute after a thrown processing error or a failed processing summary.
- Analyze all eligible pending articles, including old backlog and embedding-only backfills, through the existing pending RPC and validation/save logic. Do not cap analysis to ten or restrict it to the latest source/run.
- Respect host duration: use cooperative deadlines, reserve time for the analysis phase, and stop before beginning work that cannot fit. Bound in-flight calls by the remaining budget where necessary. Deferred articles/jobs must remain eligible automatically next hour, with an explicit partial/deferred outcome. Manual full analysis keeps its existing unlimited-by-count default.
- Do not rely on unawaited background work after the response. Preserve current safe PostHog lifecycle conventions if used by new routes.
- Return separate processing/analysis summaries and a truthful aggregate status. Persist progress safely without letting logging failure suppress the analysis phase.

### Read routes and security

- `GET /api/oxylabs/schedules` returns paginated stored records; `GET /api/oxylabs/runs?scheduleId=<internal UUID>` returns paginated run history. Both require the admin header, as operational data is private.
- Keep all provider/database/pipeline modules server-only, routes thin, responses uncached, input schemas strict, and errors sanitized. Credentials must never enter URLs or client bundles.
- Keep RLS and revoked browser privileges intact; use `getSupabaseAdmin()` only on the server. Do not add Supabase Auth or joined-table `.eq('foreign.column', value)` filters.
- Preserve existing user changes. No unrelated refactoring, new queue framework, new scraping source URLs, or UI features.

## Acceptance criteria

1. Repeated sync converges to one active hourly schedule per active source, without accumulating billable orphans.
2. Large external identifiers survive transport, URLs, persistence and logs/status handling exactly.
3. Pending/faulted provider jobs are never fetched; duplicate and concurrent completed-job delivery cannot duplicate article insertion.
4. Five-source defaults and per-source insertion ceilings match the user's selection.
5. Shared parser validation and append-only dedupe match manual scraping behavior.
6. Interrupted processing is recoverable automatically; deferred work is accurately reported.
7. Cron performs analysis even after processing failure; analysis/embedding completion controls publication as before.
8. Invalid manual credentials and invalid production Cron credentials return 401 without provider or database mutations.
9. Cron configuration is valid, runtime budgets are handled, and production setup requirements are documented accurately.
10. Typecheck, lint, build and relevant tests are run, with exact results and any remaining external setup limits reported.

## Checks to run

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:data`
- `npm run test:scraping`
- `npm run test:analysis`
- Add/run `npm run test:scheduler` for mocked provider contracts, unsafe integer preservation, sync idempotence and partial failures, orphan cleanup safety, source selection, done-only processing, duplicate/concurrent claims, stale recovery, deadline deferral, and analysis-after-processing-error.
- Use meaningful integration checks around changed persistence behavior; include live read-only verification of stored schedule/run rows when available. No paid provider calls in ordinary automated tests.

## Exact manual test steps expected after implementation

Commands below use PowerShell and `curl.exe`. Supply the existing admin secret through `$env:BIASLY_ADMIN_SECRET` in the calling terminal without committing or printing it. Start the server with `npm run dev`; watch that terminal for scrape, scheduler and analysis progress.

1. Inspect source selection and unauthorized behavior:

   ```powershell
   curl.exe -i http://localhost:3000/api/sources
   curl.exe -i -X POST http://localhost:3000/api/oxylabs/schedules
   ```

   The second request must return 401 and create no schedules.

2. Activate hourly schedules once, then repeat to confirm reuse rather than duplication:

   ```powershell
   curl.exe -i -X POST http://localhost:3000/api/oxylabs/schedules -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H "Content-Type: application/json" --data-raw '{}'
   curl.exe -i http://localhost:3000/api/oxylabs/schedules -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
   ```

   This is a live activation step: recurring Oxylabs scraping continues after the terminal closes. Verify five mappings and exact external IDs.

3. After Oxylabs has a completed hourly run, process the default five articles per active source:

   ```powershell
   curl.exe -i -X POST http://localhost:3000/api/oxylabs/scheduled-results/process -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H "Content-Type: application/json" --data-raw '{}'
   ```

   Verify valid articles, counts and safe run summaries. Repeat to confirm completed jobs are skipped. Before the first completed provider run, an empty result is expected, not proof of full end-to-end success.

4. Read run history using an internal schedule row UUID from step 2:

   ```powershell
   $scheduleRowId = 'REPLACE_WITH_INTERNAL_SCHEDULE_UUID'
   curl.exe -i "http://localhost:3000/api/oxylabs/runs?scheduleId=$scheduleRowId&limit=20" -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
   curl.exe -i http://localhost:3000/api/logs -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
   ```

5. Run the complete local pipeline; no local Cron secret is needed:

   ```powershell
   curl.exe -i http://localhost:3000/api/cron/pipeline
   ```

   Confirm both phase summaries, pending analysis/embedding completion and homepage visibility. To explicitly analyze pending articles separately:

   ```powershell
   curl.exe -i -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H "Content-Type: application/json" --data-raw '{}'
   ```

6. Production setup is independent of schedule activation: configure required server environment values and a generated `CRON_SECRET` in the Vercel production project, use an hourly-capable plan, deploy the reviewed implementation, and verify the registered minute-15 Cron. Never put `CRON_SECRET` in `.env.local`.

   ```powershell
   $productionOrigin = 'https://REPLACE_WITH_PRODUCTION_DOMAIN'
   curl.exe -i "$productionOrigin/api/cron/pipeline"
   ```

   This unauthenticated request must return 401. Verify authorized execution through Vercel's Cron controls/logs, then observe an actual hourly run. Confirm stored job status, processing counters, analysis results, and absence of duplicate articles.

7. Automated failure-injection tests must demonstrate processing-error/analysis-success and deadline recovery without deliberately breaking production credentials.

Final delivery must distinguish passed automated checks, completed live checks, schedule activation state, deployment state, and any setup still required.
