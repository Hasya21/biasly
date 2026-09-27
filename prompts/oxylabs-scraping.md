# Oxylabs manual scraping pipeline

## Goal

Implement the production-style manual scrape-to-insert pipeline specified in AGENTS.md sections 8–17. Fetch active stored source entry pages through Oxylabs, extract real story cards, scrape eligible article details, clean and validate them, and append valid articles to Supabase. Return a complete synchronous summary and persist safe operational logs.

Status: prepared for user approval; implementation has not started.

## Skills and documentation read

- `.agents/skills/web-scraper-api/SKILL.md` (explicitly requested; this is the installed Oxylabs skill).
- `.agents/skills/supabase/SKILL.md`.
- `AGENTS.md` and `PROJECT_MEMORY.md`.
- Installed Next.js `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`; consult the detailed route/runtime documentation before implementation.
- Supabase changelog fetched and JavaScript insert documentation reviewed. Recheck relevant breaking changes before implementation.
- Oxylabs official Realtime examples: https://github.com/oxylabs/agent-skills/blob/main/skills/web-scraper-api/examples.md and integration overview: https://github.com/oxylabs/web-scraper-api.

## Existing code inspected

- `package.json`, `.env.example`, `proxy.ts`.
- `lib/supabase/server.ts`, `types.ts`, `validation.ts`.
- `lib/supabase/queries/sources.ts`, `articles.ts`, `logs.ts`.
- Core table definitions and article URL collision guard in `supabase/schema.sql`.
- There is no existing `app/api` implementation. Cheerio and Zod are not installed. Node test runner and tsx are already available.
- Source reads are paginated; article existence checks already chunk URLs into groups of at most 15 and compare both URL columns. Insert collisions return `duplicate` and do not overwrite records.
- Log context currently permits only safe scalar counters/categories. Preserve that safety while supporting a fixed-key rejection histogram if needed.

## Decisions and assumptions

- Scope is manual scraping. Scheduler, Cron, AI analysis, embeddings and UI changes are separate follow-ups. Keep shared processing reusable by accepting homepage HTML independently of the trigger.
- Live read-only Supabase inspection on 2026-09-23 found:
  - BBC News — `85c78a73-82be-4abd-bb2b-a9b2b1ec47e9`, stored entry `https://www.bbc.com/news`, parser strategy null.
  - The Guardian — `8de88c16-04f5-4778-9c43-94ccb176f3ec`, stored entry `https://www.theguardian.com/international`, parser strategy null.
- These entries are evidence only: always read current active sources from Supabase, never hardcode entry URLs in implementation or overwrite source rows.
- Default selection and live verification: all active sources, up to 5 successfully inserted valid articles per source, unless the user chooses otherwise. Source choice has been requested separately.
- Support a strict JSON body `{ "sourceIds": ["uuid"], "limitPerSource": 5 }`; omitted properties use defaults. Permit limits 1–20 and at most 100 explicitly selected UUIDs; reject empty selections, unknown fields, malformed JSON, invalid limits and inactive/unknown selected IDs with 400 before paid requests. Empty body and `{}` use defaults.
- Add `GET /api/sources` to expose only active source ID/name/listing URL/logo for manual selection. Add admin-protected `GET /api/logs` with validated pagination and optional run ID for operational inspection.
- New articles remain pending analysis (`analyzed_at` null); they will not yet appear in the analyzed news feed.
- No database schema change is expected. If one becomes necessary, keep schema/types synchronized and apply reviewed SQL before runtime verification; do not recreate existing tables.

## Likely files

- `app/api/scrape/route.ts`, `app/api/sources/route.ts`, `app/api/logs/route.ts`.
- `lib/api/admin.ts` for shared server-only header authorization and safe errors.
- `lib/scraping/oxylabs.ts` for provider transport.
- `lib/parsing/` for URL normalization, source strategies, homepage extraction and detail cleanup/validation.
- `lib/pipeline/` for limits, types, logging and orchestration.
- Targeted changes to `lib/supabase/queries/logs.ts` and source-query helpers only as necessary.
- `tests/scraping.test.ts`, compact representative HTML fixtures, `package.json`, `package-lock.json`.
- `.env.example`, `README.md`, `PROJECT_MEMORY.md` and a verification report beside this prompt.

## Implementation requirements

1. Thin Node runtime POST handler: authorize first, validate request/config, invoke pipeline, return summary directly. Do not require polling. Unsupported methods return 405. Use explicit safe HTTP errors, no provider response bodies.
2. Server-only Oxylabs Realtime transport uses HTTP Basic Auth with `OXY_WSA_USERNAME` and `OXY_WSA_PASSWORD`, `source: universal`, stored/validated URL and raw HTML output. Validate outer HTTP and per-result status/content. Bound response size, requests and timeouts; retry transient errors only with a small explicit budget. Rendering is a deliberate source need, not an unconditional extra request. Never stringify a parsed large numeric provider ID; omit unused IDs or extract exact strings before parsing if needed.
3. Page through all active sources. Resolve explicit IDs against current active rows. No request-supplied arbitrary URLs, source updates, seeds or source activation.
4. Source strategies for the observed BBC and Guardian entry pages, with conservative generic support for other stored sources. Respect recognized `parser_strategy` values; unknown strategies fail safely. Strategy inference can use the stored hostname when null without embedding entry URLs.
5. Extract story links only from content story cards/headlines. Exclude navigation/footer/sidebar promotions, hidden nodes, non-story link collections and the entire AGENTS.md non-article reject list. Never recursively visit listing/category links. Validate same publisher host and article URL shape before detail requests; BBC sport/live/category pages and Guardian section/filter pages are rejected. Treat uncertain paths conservatively.
6. Normalize relative URLs, fragments and known tracking parameters without discarding meaningful identity parameters. Reject non-HTTP(S), credentials, private/loopback hosts and off-publisher candidate/canonical URLs. Validate provider final URLs too. No local fallback fetches of untrusted links.
7. Deduplicate normalized homepage candidates, query stored original/canonical URLs with existing chunked helpers, then fetch eligible details. Validate canonical identity and check both URLs again before append-only insertion; preserve database collision protection for concurrent runs.
8. Parse title, publication date, image and canonical metadata using Cheerio, article-specific JSON-LD, OpenGraph and source DOM where appropriate. Handle JSON-LD arrays/graphs and malformed blocks safely. Missing canonical may fall back to the validated detail URL; never fabricate missing date/image or use current time as publication time.
9. Extract one article body, removing scripts/styles/ads/newsletter/subscription/related/most-viewed/share/navigation/captions/bios and repeated noise. Do not accept a whole-page text dump or unrelated headline list. Split long single-block text at DOM/sentence boundaries when helpful. Apply meaningful-body gate: at least three meaningful paragraphs or 900 meaningful cleaned characters. Require a specific title, image, date, source and valid original/canonical URLs; reject generic, listing, live and other non-article pages even if metadata resembles an article.
10. Iterate until the valid insertion limit or available eligible candidates are exhausted, with centralized bounded detail-attempt limits (default 30 attempts per source, scaling only within a documented maximum for larger requested limits). Report exhaustion/bounds; never silently claim complete coverage. Prefer fewer good articles. Isolate article/source failures so later work continues; stop further provider calls on global invalid credentials.
11. Typed summary includes `status`, `sources_checked`, `candidates_found`, `candidates_rejected`, `duplicates_skipped`, `detail_pages_scraped`, `articles_inserted`, `articles_rejected`, `articles_failed`, `duration_ms`, and `rejection_reasons` by fixed reason code. Include source outcomes and an internal UUID run ID if useful; polling is not required. Define completed/partial/failed consistently and distinguish duplicate/validation/fetch/insert failures without double counting.
12. Emit start, selected sources, homepage/candidate/dedupe/detail/insert/reject/error and final summary console messages. Persist safe start/source/final operational events via `insertLog`. Logging failures must be visible as safe warnings without losing successful insertion outcomes or causing false success reporting. Never log credentials, raw HTML, response bodies or unsanitized exceptions.
13. Install pinned Cheerio and Zod versions with lockfile updates. Use TypeScript, small explicit functions, server-only boundaries and existing database helpers; preserve all unrelated user work.

## Security requirements

- Reject missing/incorrect `x-biasly-admin-secret` with 401; a missing configured secret must fail closed. No query-string credentials. Compare secret safely and never expose it in browser code.
- Keep Supabase service role, Oxylabs credentials and all pipeline operations server-side. Maintain existing RLS and private table permissions.
- Validate bounded request payloads before paid scraping. Never bypass admin authorization through Clerk or an alternate method.
- Operational log reads require the same admin header; sources endpoint returns only explicitly selected public fields.
- No schema reset, delete, article replacement or analysis-state mutation. Scraping creates pending articles only.

## Acceptance criteria and checks

- Authorized default POST processes current active sources with up to five valid inserts each; explicit source/limit options work. Unauthorized requests cannot invoke provider/database pipeline work.
- Fixtures prove BBC/Guardian story extraction, strict forbidden URL rejection, missing date/image rejection, one-block long body acceptance, noisy/listing page rejection, canonical collision handling and URL normalization.
- Mocked integration tests prove chunked dedupe reuse, insertion limit behavior after duplicates/rejections, continuation after source/article failure, provider timeout/error handling, protected routes and accurate summaries.
- Run `npm run typecheck`, `npm run lint`, `npm run build`, existing `npm run test:data` and `npm run test:db`, and a dedicated `npm run test:scraping` script. Report actual outputs and any blockers.
- Perform one selected live scrape after implementation and inspect saved article/log rows with read-only queries. Re-check stored returned URLs for dedupe without deleting articles or requiring a second full paid run. Inspect saved text for quality and verify pending analysis timestamps.
- Record live calls, selected limits, inserts/rejections, database evidence and limitations honestly. If runtime/configuration prevents validation, report exactly what remains unverified.

## Exact manual test steps after implementation

1. Set existing Supabase server credentials, `OXY_WSA_USERNAME`, `OXY_WSA_PASSWORD`, `BIASLY_ADMIN_SECRET` in ignored `.env.local`. Do not add `CRON_SECRET`. Run `npm run dev`; watch this terminal for progress and final summary.
2. In another PowerShell terminal set the same admin secret privately: `$env:BIASLY_ADMIN_SECRET = '<your configured secret>'`.
3. List sources: `curl.exe -i http://localhost:3000/api/sources`.
4. Verify unauthorized access: `curl.exe -i -X POST http://localhost:3000/api/scrape -H 'Content-Type: application/json' --data '{}'` (expect 401 and no scrape).
5. Default scrape: `curl.exe -i -X POST http://localhost:3000/api/scrape -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data '{}'`.
6. Selected-source example using PowerShell-safe stdin JSON:

```powershell
'{"sourceIds":["85c78a73-82be-4abd-bb2b-a9b2b1ec47e9"],"limitPerSource":2}' | curl.exe -i -X POST http://localhost:3000/api/scrape -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'
```

Use IDs returned by the source endpoint if active rows change. Each authorized scrape performs paid provider requests; default and selected examples are alternative manual runs.

7. Read logs: `curl.exe -i 'http://localhost:3000/api/logs?limit=20' -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"`.
8. Invalid limit example: `' {"limitPerSource":0}' | curl.exe -i -X POST http://localhost:3000/api/scrape -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'` (expect 400 without provider requests). `curl.exe -i http://localhost:3000/api/scrape` must return 405.
9. Inspect Supabase articles ordered by scraped_at: valid source/title/original/canonical/image/publication/body fields, null analyzed_at, existing records preserved. Inspect logs for counters. New rows require the separate AI analysis feature before appearing in the public analyzed feed.
