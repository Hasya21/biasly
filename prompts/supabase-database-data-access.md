# Supabase database and data access

## Goal
Implement the initial Supabase persistence foundation for Skew News (branded biasly in the existing app): six core tables, database constraints and permissions, TypeScript database types, and reusable server-only query/write helpers.

## Skills and documentation read
- `.agents/skills/supabase/SKILL.md` (explicitly requested).
- `.agents/skills/supabase-postgres-best-practices/SKILL.md` (supporting database guidance required by the available skill instructions).
- `AGENTS.md`.
- Installed Next.js guides: `01-app/01-getting-started/05-server-and-client-components.md` (server-only boundaries) and `06-fetching-data.md` (database reads).
- Supabase changelog fetched from https://supabase.com/changelog.md; relevant documentation: https://supabase.com/docs/guides/database/tables and https://supabase.com/docs/guides/api/securing-your-api.
- Before implementation, verify current typed-client, joins, functions, and RLS documentation and relevant changelog entries; read supporting database reference files as needed.

## Existing code inspected
- `package.json`, `tsconfig.json`, `.env.example`, `README.md`, `lib/` inventory.
- `app/page.tsx`: renders sample articles.
- `app/news/[id]/page.tsx`: sample article lookup and illustrative metadata.
- `proxy.ts`: Clerk protection for a static allowlist of sample detail URLs.
- No existing Supabase directory, database client, schema, or Supabase dependency was found. There are substantial pre-existing uncommitted changes; preserve them.

## Decisions and assumptions
- This is the initial database/data-access stage. Keep the current sample UI and Clerk behavior unchanged; connecting live articles to UI requires a subsequent change that also replaces the static auth allowlist. Do not claim the UI uses stored records after this stage.
- Build persistence for all six required tables, but do not implement scraping, AI calls, scheduler integration, Cron, or new HTTP routes.
- Defer embeddings, pgvector, and related-article queries until analysis is working, per AGENTS.md sections 7 and 20.
- Use server-side service-role access with explicit, minimal return projections. No Supabase Auth, browser database client, cookie/session integration, or user table is needed.
- No invented source URLs or sample news inserted into the live database.
- Identify the configured Supabase project and inspect existing database objects before applying SQL. Never print credentials. No Supabase MCP tools are currently exposed; discover available CLI/database access during execution. If live SQL access is unavailable, finish local deliverables and provide the exact SQL Editor steps, clearly reporting live verification as blocked.

## Files likely to change
- `supabase/schema.sql`: canonical initial schema, privileges, constraints, indexes, and narrowly scoped functions if needed.
- `supabase/verify.sql`: transactional database checks with rollback.
- `lib/supabase/types.ts`: Database table/function definitions and typed domain DTOs.
- `lib/supabase/server.ts`: lazy service-role client construction and safe environment validation.
- `lib/supabase/queries/sources.ts`, `articles.ts`, `analyses.ts`, `logs.ts`, `schedules.ts`: small cohesive data access functions.
- A small validation/limits module under `lib/supabase/` if shared helpers are needed.
- `package.json`, `package-lock.json`, `.env.example`, `README.md`.
- Focused data-access tests and a documented verification command when needed; avoid production test endpoints.
- If an existing migration workflow is discovered, follow it. Otherwise use the project-required SQL Editor/schema.sql workflow; if adding imperative migration files, create them through the CLI per the skill.

## Implementation requirements
1. Install and pin a current compatible `@supabase/supabase-js` version and `server-only`; commit no secrets. Do not add SSR auth dependencies.
2. Define UUID primary keys and timestamptz timestamps, explicit foreign keys, and indexes supporting relationships and actual list queries. Preserve existing remote rows and schema objects; never reset a database.
3. `sources`: name, unique homepage `listing_url`, optional parser strategy, active flag, optional logo URL, timestamps. Provide ordered active-source reads with optional selected IDs. Source administration remains server-side.
4. `articles`: source reference, unique original URL, canonical URL, title, required image URL, required published date, meaningful cleaned `raw_text`, scraped timestamp, nullable analyzed timestamp. Validate nonblank fields and HTTP(S) URLs. Preserve append-only inserts and return an explicit duplicate outcome instead of updating an existing article.
5. Deduplicate incoming original/canonical URLs against both stored URL columns. Query URLs in chunks no larger than 15 per `.in()` call. Enforce uniqueness and prevent races from creating duplicates, including cross-column collisions; choose a small transactional implementation if separate unique indexes cannot cover the invariant. Do not broadly rewrite URL paths or discard meaningful query parameters.
6. `article_analyses`: unique article reference, summary, sentiment score/label, derived bias score, bias label, left/center/right percentages, confidence, framing notes, loaded terms, disclaimer, model and timestamps. Enforce valid labels, score ranges, confidence range, and percentages totaling 100 in the database and validate runtime input. Compute bias score as `(right_percentage - left_percentage) / 100`; use precise numeric arithmetic. No embedding column yet.
7. Save valid analysis and set article `analyzed_at` atomically. A failed write must leave neither partial completion nor a misleading analyzed timestamp. Keep SQL functions invoker-security where possible, schema-qualify references, and restrict execution to service_role.
8. Detect pending articles using a LEFT JOIN/NOT EXISTS against `article_analyses`, irrespective of `analyzed_at`; a missing analysis with a stale timestamp must still be returned. Use bounded configurable pages and deterministic ordering; data access must support processing every pending article without imposing a hardcoded overall cap.
9. Provide paginated published-article reads and lookup by ID, joined with source and analysis, exposing only appropriate fields. Published records require a saved analysis and non-null analyzed timestamp. Return null for a missing record; distinguish database errors from empty results. Keep raw text out of feed projections. Avoid `.eq('foreignTable.column', value)`; use root filters, SQL queries/functions, or correct bounded post-filtering without corrupting pagination.
10. `logs`: event type, level, message, optional source/article references, structured JSON context, run correlation ID and timestamp as appropriate. Add insert and bounded chronological read helpers. Store safe operational information only.
11. `oxylabs_schedules`: one stored schedule per source, external schedule ID as text, state and timestamps. `oxylabs_schedule_runs`: schedule reference, external job/run identifiers as text, processing status, relevant timestamps, safe summary/error fields. Prevent duplicate job processing records through a unique key. Helpers manage stored state only; do not call Oxylabs. Never coerce external 64-bit IDs to JS numbers.
12. Use strict TypeScript, typed joins, explicit return types, centralized bounds, and safe errors. Keep server-only imports on every runtime database module; types may be imported by other layers without pulling in secrets. Do not initialize the client or require environment variables at module load/build time.
13. Update `.env.example` comments and README with setup, schema application, function contracts, verification, and the distinction between this data layer and the existing sample UI. Keep the canonical variable names; no CRON_SECRET in `.env.local`.

## Security requirements
- Enable RLS on all six public-schema tables.
- Since this stage uses server-mediated access, explicitly revoke anon/authenticated table writes and reads; do not add permissive public policies or expose logs, raw text, pending articles, or scheduler data through the Data API.
- Grant only required service-role table/function privileges. Revoke default PUBLIC function execution for privileged/internal helpers.
- Service-role key stays server-only and never appears in response DTOs, browser bundles, logs, committed files, or test output.
- Query helpers are internal, not Server Actions or unauthenticated routes. Future route/UI callers remain responsible for Clerk/admin authorization.
- Parameterize queries and validate inputs. Do not swallow errors as successful empty results.

## Acceptance criteria
- All six table definitions, constraints, relationships, types and access helpers agree.
- Active-source filtering works and inactive sources are excluded when requested.
- Original/canonical dedupe works across both columns and concurrent inserts cannot overwrite articles.
- Invalid analyses and articles are rejected; successful analysis writes atomically mark completion.
- Pending selection catches missing analysis rows even with analyzed_at set; list pagination is stable.
- Large scheduler/job IDs round-trip exactly as strings.
- Anonymous/authenticated Data API users cannot access internal tables or write data; service-role queries work.
- UI and Clerk preview remain functional and unchanged. No unrelated implementation or fake live data.
- Report whether SQL was actually applied and live queries actually ran, separately from local checks.

## Checks to run
- `npm run typecheck`
- `npm run lint`
- `npm run build` (new server modules and dependencies)
- Focused SQL/integration checks: constraints, duplicate handling, atomic analysis save, pending detection, pagination, permissions, and external-ID precision. Use temporary fixtures in transactions with rollback; never delete existing records.
- Run available Supabase security advisors after applying SQL. Report exact check output and any access blockers; never claim unexecuted checks passed.

## Exact manual test steps expected after implementation
1. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the existing ignored `.env.local`, preserving Clerk keys. Never add CRON_SECRET locally.
2. Open the identified Supabase project's SQL Editor. Inspect existing tables first, then run the reviewed `supabase/schema.sql` for a fresh database or the delivered non-destructive ALTER SQL for an existing schema. Do not apply a reset.
3. Run `supabase/verify.sql` in SQL Editor. It must create isolated transactional fixtures, check required-field and percentage constraints, test original/canonical duplicates, verify pending detection with a stale analyzed_at, save analysis atomically, check a large text job ID, verify roles/RLS, and finish with ROLLBACK.
4. Run the documented data-access verification command supplied by the implementation against that project; check active sources, empty/missing reads, joined analyzed reads and pending pages. Do not scrape or call AI providers.
5. Run `npm run typecheck`, `npm run lint`, and `npm run build` from the project root; retain command results.
6. Run `npm run dev`; open `http://localhost:3000`, sign in and open `/news/peace`, and open `/news/does-not-exist`. Confirm the existing sample preview/auth/not-found behavior and inspect terminal errors.
7. After building, run `npm run start` for a production smoke check. The UI remains a clearly labeled sample preview until a separately scoped live-data integration.

## Approval gate
Prepared for user review. Do not implement code or mutate the database until this prompt is approved, per AGENTS.md section 2.
