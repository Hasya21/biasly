This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses `next/font` to self-host Poppins (400, 500, 600, 700). The initial build needs network access to download the font.

## biasly homepage

The homepage reads published articles from Supabase at request time. A published article has a saved analysis and a non-null analyzed_at. One eligible database article produces one card. There is no sample fallback; an empty database displays “No analyzed articles yet”, while query failures display a separate retry screen.

Cards show the stored title, image, publisher, publication date, sentiment, framing percentages and confidence. They link to /news/<article UUID>. The source active flag controls ingestion, not publication visibility. The manual-demo-fixture model receives an explicit demo label.

The feed shows 20 records per page with Previous/Next links. Unsupported sample topic/category/region controls and source counts have been removed. Light/Dark/Auto themes and the responsive grid remain. Images load in the browser through unoptimized Next Image, with a fallback on failure; no unrestricted server image optimizer is enabled.

Run npm.cmd run dev and visit http://localhost:3000. Compare the cards with eligible database rows, try /?page=2, and verify mobile layout and theme persistence. The /design-system route remains an illustrative component preview.

## biasly design system

The `/design-system` route preserves the original approved design-system preview. The sample article and interactions are illustrative; no news data is fetched or saved.

- `app/globals.css` defines semantic colors, typography, spacing, radii, shadows, `app-container` (1280px), and `app-grid` (12 columns, 24px gutters).
- `components/ui/button.tsx` provides default, secondary, outline, and text variants with default, small, and icon sizes.
- `Brand`, `CategoryChip`, `BiasMeter`, and `NewsCard` are reusable presentation components. Pass stored article data to `NewsCard` when connecting a feed later.
- `BiasMeter` accepts `{ left, center, right }` percentages summing to 100; invalid or missing values show an unavailable message. Small segments use a separate text legend.
- Preview-specific layout and local interaction state live in `components/design-system/`.

Run `npm run typecheck`, `npm run lint`, and `npm run build` to verify changes. In Windows PowerShell with script execution disabled, use `npm.cmd` instead of `npm`.

For a manual check, run `npm run dev`, open `http://localhost:3000/design-system`, and resize to 1536, 1280, 768, and 375px. Check Tab focus, Enter/Space activation, chip selection, bookmark toggling, disabled buttons, and 200% zoom. This preview keeps its light theme when the OS uses dark mode. Detailed criteria are in `prompts/ui-design-system.md`.

## Stored article details

/news/<article UUID> renders the saved body and full analysis: summary, sentiment, framing, confidence, notes, loaded terms, disclaimer and model. About this article shows one publisher, the stored date and a validated original URL. Stored text is rendered as text, never HTML. Fictional fixture labels/disclaimers remain visible; real rows are not labeled as UI samples. Sample related stories and invented authors are no longer rendered.

A public query reads only identity/title and analysis existence. Missing, malformed and unpublished IDs show 404 for everyone. For existing articles, Clerk authorization runs before full text or full analysis is fetched. Metadata contains only the public article title and a generic description.

Manual checks:

1. Run npm.cmd run dev and open /. With one analyzed article in Supabase, verify exactly one card.
2. Signed out, click its title and confirm redirect to Clerk sign-in with a return destination. Sign in and confirm the saved article and full analysis appear.
3. Compare the summary, percentages, notes, loaded terms, disclaimer, model and publisher with Supabase. For the dummy fixture, confirm the demo label and manual-analysis disclaimer. Its original .invalid URL is fictional; its local image URL assumes port 3000.
4. Visit /news/not-a-uuid and /news/00000000-0000-0000-0000-000000000000: both should show not-found even signed out. Unanalyzed records must not appear in the feed or details.
5. Check 375, 768, 1024 and 1440px widths, 200% zoom, Light/Dark/Auto, keyboard navigation, Share and disclosures. Broken images should show a fallback.
6. In an isolated test project, verify zero rows produce an empty state, a failed query produces the retry UI, and more than 20 records produce pagination. Do not clear production data for these tests.
7. Run npm.cmd run typecheck, npm.cmd run lint, npm.cmd run build, npm.cmd run test:data and npm.cmd run verify:supabase. After building, npm.cmd run start provides a production smoke test.

## Clerk authentication setup and verification

Configure the Clerk environment variables from .env.example in the ignored .env.local. Keep real keys out of Git. Authentication uses @clerk/nextjs, the root proxy.ts and the existing sign-in/sign-up pages and account controls.

Middleware supplies Clerk context. lib/news/load-article.ts checks article existence and calls auth.protect() before fetching protected data for every database article UUID. There is no hardcoded sample-ID allowlist. The homepage and design-system page are public; missing articles return 404. Signing in does not grant pipeline/admin privileges.

Start npm.cmd run dev, visit a homepage card signed out, sign in and confirm return to that article. Sign out and repeat. Also check missing article IDs signed in and out. Configure Clerk production keys/domain before deploying.

## Supabase database and server data access

The persistence foundation lives in `supabase/schema.sql` and `lib/supabase/`. The homepage and details routes now read stored articles through server-only helpers. No scraping, model calls, scheduler jobs, Cron, public API endpoints or pgvector are added by this UI integration.

### Set up the database

1. Preserve the existing Clerk configuration in `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the intended Supabase project. Never share or commit the service-role key. Do not add `CRON_SECRET` locally.
2. Open that project's **SQL Editor** and inspect its current objects first:

   ```sql
   select tablename, rowsecurity from pg_tables where schemaname = 'public';
   select routine_name from information_schema.routines where routine_schema = 'public';
   ```

3. For a fresh project, paste and run `supabase/schema.sql`. It creates the six required tables and internal functions in one transaction. It intentionally fails on conflicting existing objects instead of silently accepting incompatible columns. Do not drop tables or rerun it to upgrade an existing schema; review and apply a targeted ALTER migration when needed. Keep the SQL and `lib/supabase/types.ts` synchronized.
4. Run `supabase/verify.sql` in SQL Editor. It checks constraints, both directions of cross-column URL deduplication, pending selection and cursors, atomic analysis writes, idempotent retries, external ID precision, RLS and role grants. Its fixtures use `.invalid` URLs inside a transaction and are all rolled back. It does not insert news or configured sources permanently.
5. Review the Supabase Security Advisor. All six tables use RLS and intentionally have no anon/authenticated policies or grants: only server-side service-role operations can access them.
6. Run the read-only application check:

   ```powershell
   npm.cmd run verify:supabase
   ```

   This loads `.env.local`, runs real query helpers, checks missing/empty reads and pagination where rows exist, and confirms anonymous reads are denied. It does not create source URLs, scrape articles, or write records. An empty fresh database is valid. If schema setup is incomplete, the command exits nonzero with a sanitized database code. RPCs and their grants must be installed before verification can pass.

### Data access contracts

All runtime modules import `server-only`. `getSupabaseAdmin()` creates a typed client lazily, disables session persistence and bypasses fetch caching. Importing modules does not require Supabase credentials during a build. The anon key is retained for compatibility and permission verification; application queries use the service role. These helpers are internal capabilities, not authorization checks. Future callers must enforce Clerk or admin permissions before exposing results or mutations.

| Module | Operations |
| --- | --- |
| `queries/sources.ts` | `getActiveSources({ ids?, limit?, offset? })`, `saveSource(input, id?)` |
| `queries/articles.ts` | `getPublishedArticles({ limit?, offset? })`, `getArticleById(id)`, `findExistingArticleUrls(urls)`, `insertArticle(input)`, `getPendingArticles({ limit?, after?, articleIds? })` |
| `queries/analyses.ts` | `saveArticleAnalysis(articleId, input)` |
| `queries/logs.ts` | `insertLog(input)`, `getLogs({ limit?, offset?, runId? })` |
| `queries/schedules.ts` | `saveSchedule(input)`, `getSchedules({ limit?, offset? })`, `claimScheduleRun(input)`, `finishScheduleRun(id, status, summary?, errorCode?)`, `getScheduleRuns(scheduleId, options?)` |

- Pages contain at most 100 rows (20 by default; active sources default to 100; pending articles default to 5). Continue paging active sources/schedules until an empty page when callers need all records. Reader lists sort by publication date and ID; offset pagination is deterministic for a stable dataset but can shift as new rows arrive.
- Pending reads use an actual LEFT JOIN against analyses, regardless of `analyzed_at`. Advance `after` using the last row's `{ scraped_at, id }`, including when an article fails, until an empty page. Start without a cursor next run to retry failures and discover new records. An explicit empty `articleIds` or source `ids` array selects nothing.
- Feed reads require both saved analysis and `analyzed_at`, return a bounded source/analysis projection, and omit raw text. Detail reads return raw text/full analysis and are protected by the server page loader; future callers must enforce the same authorization. Missing records return null; query failures throw a sanitized `DataAccessError` rather than pretending the database is empty.
- Insert inputs must already have passed the scraping layer's source-specific article/title/content checks and cleanup. This persistence layer checks required fields, HTTP(S) URLs, and a minimum body of 900 trimmed characters or three paragraphs of at least 40 characters. It cannot establish semantic article quality or detect all webpage boilerplate. URL normalization removes fragments and preserves query parameters and path semantics.
- Article insertion returns `{ status: 'inserted', article }` or `{ status: 'duplicate' }`. It never replaces a record. URL checks query both columns in chunks of at most 15; the database trigger also enforces cross-column identity under a transaction advisory lock. Article URLs are immutable. Insert transactions must use READ COMMITTED (the default); other isolation levels are rejected to prevent stale-snapshot races. The lock briefly serializes inserts and is intended for this small ingestion workload.
- Analysis validation rejects invalid labels/ranges and percentages; PostgreSQL numeric constraints require an exact total of 100 and derive bias score. `save_article_analysis` locks the article and saves analysis/completion atomically. The first valid saved analysis wins on retries. No embeddings are generated or stored yet.
- Scheduler IDs, external run IDs, and job IDs are digit strings, never JS numbers. A unique job ID makes claiming atomic; a losing claim returns null and must not process the job. Completion only transitions `processing` rows and returns null if already finalized. Failed/stale claims are retained; retry/recovery orchestration is outside this persistence stage.
- Log messages must be fixed application messages, never raw provider errors. Context and run summaries retain only supported counters, status, and error codes. Unknown context keys are dropped. Never pass credentials, headers, raw article text, or provider payloads to logging helpers.

### Local checks and smoke test

Requires Node.js 22 or newer (verified with Node 24). On Windows PowerShell use `npm.cmd`; other shells can use `npm`.

```powershell
npm.cmd run test:db
npm.cmd run test:data
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

`test:db` runs the actual schema and transactional verification SQL in an in-memory PostgreSQL instance (PGlite), without network access or live data. It verifies rollback leaves all six tables empty. PGlite has a single connection, so it cannot verify multi-session lock contention. `test:data` tests runtime input gates and the Supabase HTTP query contracts with a fake fetch implementation that refuses real project URLs.

For a real PostgreSQL concurrency check, use two persistent `psql` connections against a development project and a real configured source ID. In session A begin a transaction, insert a valid article with original URL A/canonical URL B, then leave it uncommitted. In session B insert a valid article with original URL B/canonical URL C: it must wait. Commit session A; session B must fail with `23505`. Roll back session B. Use only disposable development fixtures; this check retains session A's article. Do not run it against production news. Dashboard SQL Editor requests are not suitable for keeping the two transactions open.

Run `npm.cmd run dev`, open `/`, sign in and follow a stored article card, then visit `/news/does-not-exist`. Confirm database content, sign-in protection and not-found behavior, and inspect the dev terminal. After the build, `npm.cmd run start` provides a production smoke check. No new curl endpoints are introduced.

## Manual Oxylabs scraping

Configure `OXY_WSA_USERNAME` and `OXY_WSA_PASSWORD` with **Web Scraper API** credentials and a strong `BIASLY_ADMIN_SECRET` in ignored `.env.local`. Keep the Supabase server credentials configured. Start `npm.cmd run dev` and watch its terminal for scrape progress.

In another PowerShell terminal, set `$env:BIASLY_ADMIN_SECRET` to the local configured value, then run:

```powershell
# List active stored sources.
curl.exe -i http://localhost:3000/api/sources
# Scrape all active sources, up to 5 valid new articles each.
curl.exe -i -X POST http://localhost:3000/api/scrape -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data '{}'
# Read private operational logs.
curl.exe -i 'http://localhost:3000/api/logs?limit=20' -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
```

For selected sources, replace the UUID with one returned by `/api/sources`:

```powershell
'{"sourceIds":["85c78a73-82be-4abd-bb2b-a9b2b1ec47e9"],"limitPerSource":2}' | curl.exe -i -X POST http://localhost:3000/api/scrape -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'
```

Limits are integers from 1 to 20; selections contain 1–100 active source UUIDs. Empty body or `{}` uses defaults. Invalid input returns 400; missing/wrong admin headers return 401; GET scraping returns 405. Full failures return 502; completed and partial runs return 200 with an explicit `status`. Logs accept `limit`, `offset`, and `runId` query parameters and require the admin header.

The synchronous response includes source outcomes, candidate/rejection/duplicate/detail/insert/failure counters, elapsed time and rejection reasons. Attempts are capped at `min(100, max(30, limitPerSource * 6))` per source. `attempt_limit` indicates incomplete processing; `exhausted` can legitimately yield fewer valid articles. Oxylabs requests have a 180-second timeout and one retry for 429/5xx responses. Provider authorization failures stop the entire run. Hosting request-duration limits still apply to a synchronous multi-source run; use smaller selections on constrained hosts.

Only story cards from stored entry pages are considered. BBC, Guardian, NPR, Reuters and AP have dedicated parsing strategies; generic parsing is conservative. Recognized `parser_strategy` values are `bbc`, `guardian`, `npr`, `reuters`, `ap`, and `generic`; null infers from the stored hostname. NPR's explicitly configured news section is its entry page; no further listing pages are crawled. Inserts preserve existing records and require clean article text, image, date, title and canonical identity. New articles have null `analyzed_at` and need the separately implemented analysis stage before appearing in the feed. Scheduler and Cron are not part of this manual endpoint.

Run `npm.cmd run test:scraping` for isolated tests. For explicit paid live verification against all active sources, run `node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-scraping.ts` while the dev server runs. Optional UUID arguments restrict it to selected sources. This performs one real scrape and append-only inserts; it is not an offline test. It verifies route responses, saved logs, article previews and URL deduplication.

To register NPR, Reuters and AP News in another configured database, run `node --env-file=.env.local --conditions=react-server --import tsx scripts/add-news-sources.ts`. Existing matching rows and their settings are preserved. The setup script does not scrape or activate existing inactive rows.

Test only these three additions in the current project:

```powershell
$body = @{ sourceIds = @('25865f99-b194-458d-b0e0-07a25e87ec62', '131db4e8-90a4-4a86-8a78-06ec32d9ab0d', 'ef6507c4-38a7-49ef-9a1f-82907a7d12ab'); limitPerSource = 5 } | ConvertTo-Json -Compress
$body | curl.exe -i -X POST http://localhost:3000/api/scrape -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'
```

Use IDs from `/api/sources` in other databases. Watch the Next.js dev-server terminal for per-source progress and the final summary.

## AI article analysis

`POST /api/analyze` processes stored pending articles using OpenAI through the Vercel AI SDK. Configure server-only `OPENAI_API_KEY`, `BIASLY_ADMIN_SECRET`, and existing Supabase credentials in `.env.local`. `ANALYSIS_BATCH_SIZE` is an integer from 1 to 100 (default 5). The model is `gpt-5.4-mini`; each analysis records the actual response model identifier. No schema changes are needed for this stage.

Start `npm.cmd run dev` and watch its terminal for batch progress and the final summary. In another PowerShell terminal, set `$env:BIASLY_ADMIN_SECRET` to the same configured secret, then run:

```powershell
# One pending article.
'{"limit":1}' | curl.exe -i -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'
# All pending articles, across all batches (incurs OpenAI usage).
curl.exe -i -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-raw '{}'
# Selected articles: replace with a real article UUID. Optional limit can be combined.
'{"articleIds":["REPLACE_WITH_ARTICLE_UUID"]}' | curl.exe -i -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'
# Operational logs.
curl.exe -i 'http://localhost:3000/api/logs?limit=20' -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
```

Missing/wrong admin headers return 401, malformed options return 400, oversized requests return 413, and GET returns 405. Completed/partial runs return 200 with an explicit status; fatal runs without saved analyses return 502. `limit` caps attempts, including skipped/failed articles. Empty body or `{}` processes the entire pending set. Selection accepts 1–100 UUIDs. Unknown fields are rejected. The summary includes counts, batches, failure categories, logging failures, duration and stop reason. A `completed` limited run only means the requested limit was processed, not that the entire backlog is empty.

Articles are pending when their analysis row is absent, even if analyzed_at is already set. Each run advances past unsuccessful rows; a later invocation retries them. Validated results are saved with the existing atomic RPC, which derives bias_score and sets analyzed_at together. Existing results are preserved. Concurrent invocations may spend tokens twice for the same article, although the first saved analysis wins. Avoid overlapping manual runs.

Generation is sequential within batches, with a 90-second timeout per attempt and at most two calls per article: invalid structured output retries once; transport errors do not automatically retry. Credential/access/quota errors (401/403/429) stop the run. Inputs exceeding 60,000 title/body characters are skipped rather than truncated. Invalid inputs are skipped; invalid output never publishes. Framing confidence below 0.5 requires unclear; otherwise a top-two percentage gap below 10 points requires mixed, and other labels match the strongest percentage. Loaded terms must occur in the article text. These consistency rules are application conventions, not a claim of objective political measurement.

Hosting request-duration limits still apply to the whole synchronous invocation. Batching does not bypass them: use limited requests on constrained hosts, or run the reusable pipeline in a sufficiently long-lived server process. Interrupted runs can be restarted safely. This stage does not install Scheduler, Cron, embeddings or related articles.

After success, refresh `/`, open the newly analyzed story, sign in with Clerk, and inspect its saved summary, sentiment, AI-estimated framing, percentages, confidence, notes, terms and disclaimer. Run `npm.cmd run test:analysis` for offline tests. The explicit paid smoke test below analyzes at most one pending article and verifies its persistence/publication and that a repeat run skips it:

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-analysis.ts
```

## Oxylabs Scheduler and Vercel Cron

Apply `supabase/oxylabs-scheduler.sql` in Supabase Dashboard → SQL Editor before using the scheduler. It adds a stored source URL and private pipeline leases. The lease prevents concurrent schedule synchronization; jobs also have unique claims and stale-worker fencing. Keep existing RLS and service-role-only database access.

Two independent setups enable automatic operation:

1. Call `POST /api/oxylabs/schedules` once to activate an Oxylabs schedule for each active source. It collects the stored entry page at `0 * * * *`. Schedules last one year and are automatically replaced within seven days of expiry. Sync also replaces changed source URLs and deactivates inactive-source schedules. **The configured Oxylabs account must be dedicated to this app: sync deactivates provider schedules absent from this database.**
2. Deploy `vercel.json` and configure a generated `CRON_SECRET` in the production environment; Vercel sends it as an `Authorization: Bearer` header. Never add it to `.env.local`. The current configuration uses the Hobby-compatible daily expression `15 0 * * *` (nominally 00:15 UTC; Hobby may invoke within that hour). For hourly processing, use Pro/Enterprise and change the expression to `15 * * * *`. Oxylabs homepage collection remains hourly independently of Vercel.

Each invocation processes completed homepage jobs and inserts up to five new valid articles per active source. It then analyzes eligible pending articles, including existing backlog and embedding backfills, even if processing failed. Routes use a 300-second duration. Cron's processing deadline is 100 seconds and its analysis work deadline is 220 seconds from pipeline start; standalone processing also gets 220 seconds. A 270-second request deadline bounds database/provider calls and cleanup, leaving response time before platform termination. Unfinished work remains eligible on the next invocation, which is daily with the current Vercel configuration. Completed jobs are skipped; failed/stale jobs can retry, except expired results returning 404. Daily processing with this work budget may not drain an hourly collection backlog. Two global leases expire after 15 minutes if a process dies. Production Cron requires its own secret; the admin secret does not authorize it.

Start `npm.cmd run dev` and watch its terminal for scheduler, scrape and analysis logs. In a second PowerShell terminal set `$env:BIASLY_ADMIN_SECRET` to your existing secret, then use:

```powershell
# One-time activation; repeat calls reconcile/reuse schedules.
curl.exe -i -X POST http://localhost:3000/api/oxylabs/schedules -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H "Content-Type: application/json" --data-raw '{}'

# Private schedule status.
curl.exe -i http://localhost:3000/api/oxylabs/schedules -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"

# Process completed results with the default five articles per active source.
curl.exe -i -X POST http://localhost:3000/api/oxylabs/scheduled-results/process -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H "Content-Type: application/json" --data-raw '{}'

# Local end-to-end processing + analysis; no local Cron secret is required.
curl.exe -i http://localhost:3000/api/cron/pipeline

# Replace this with the internal UUID from the schedules response, not the provider ID.
$scheduleRowId = 'REPLACE_WITH_INTERNAL_SCHEDULE_UUID'
curl.exe -i "http://localhost:3000/api/oxylabs/runs?scheduleId=$scheduleRowId&limit=20" -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
curl.exe -i http://localhost:3000/api/logs -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
```

Manual processing accepts optional `sourceIds` (active source UUIDs) and `limitPerSource` (1–20); schedule sync always reconciles all active sources. Before the first hourly provider run, zero completed jobs is expected. Calling the process route does not run analysis; use the local Cron route above or `POST /api/analyze` to run both stages separately. In production, an unauthenticated request to the Cron route must return 401. Confirm the registered daily trigger and actual execution in Vercel's Cron controls/logs after deployment.

Offline regression: `npm.cmd run test:scheduler`. Hosted schema/lease/provider verification:

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-scheduler.ts
# Optional live activation/reconciliation and processing; these make provider calls.
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-scheduler.ts --activate --process
```

The verification script's default checks lease exclusivity and existing schedules without activating new ones. The `--activate` flag creates recurring paid scraping work; active Oxylabs jobs continue independently of the dev server. See `prompts/oxylabs-scheduler-verification.md` for the implementation's recorded results and deployment state.

## Next.js resources

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
