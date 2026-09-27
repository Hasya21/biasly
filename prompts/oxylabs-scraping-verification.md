# Oxylabs scraping verification — 2026-09-23

Implemented the approved manual pipeline, authenticated scraping/log routes, public active-source route, parsing, provider transport, append-only orchestration, isolated tests and manual instructions. No schema changes. Cheerio 1.2.0 and Zod 4.6.5 are pinned. Installation reported `found 0 vulnerabilities`.

## Automated checks

Commands use `npm.cmd` on this Windows host because PowerShell blocks npm.ps1.

`npm.cmd run typecheck` exited 0:
```text
> skewed_news@0.1.0 typecheck
> tsc --noEmit
```

`npm.cmd run lint` exited 0 with no diagnostics:
```text
> skewed_news@0.1.0 lint
> eslint
```

`npm.cmd run test:scraping` exited 0:
```text
✔ publisher boundaries, tracking normalization and non-article URL gates
✔ homepage extraction excludes navigation, hidden and non-story links
✔ detail validation accepts long single blocks and rejects missing metadata, listings and noise
✔ authorization and strict bounded options fail before pipeline access
✔ pipeline continues after rejected/duplicate articles and source failures, respecting inserted limit
✔ canonical collisions skip inserts; fatal credentials stop provider work; logging errors surface
✔ provider validates status/content, retries transient failures and sanitizes errors
ℹ tests 7
ℹ pass 7
ℹ fail 0
```

`npm.cmd run test:data` exited 0, 3 passed / 0 failed. Its existing mocked query test verifies URL filter chunks of at most 15 and cross-column queries.

`npm.cmd run test:db` exited 0:
```text
PASS: database constraints, dedupe, pending cursors, atomic analysis, IDs, RLS, and service permissions; fixtures rolled back
PASS: isolated PostgreSQL schema loaded; all six tables empty after verification.
Note: PGlite is single-connection; multi-session lock contention requires hosted/local PostgreSQL verification.
```

`npm.cmd run build` compiled and generated the production routes successfully. The existing warning concerns an unrelated `C:\Users\Dell\package-lock.json` outside this repository. API routes are dynamic. `git diff --check` exited 0 (only Windows line-ending notices).

## Live verification

- Active sources read from Supabase: BBC News and The Guardian.
- With user authorization, generated a 32-byte random admin secret and saved it to ignored `.env.local`. `git check-ignore .env.local` confirmed exclusion. No secret is printed in reports.
- GET `/api/sources`: 200 and the two active source projections.
- POST `/api/scrape` without secret: 401.
- GET `/api/scrape`: 405.
- POST `/api/scrape` with authorized invalid limit: 400.
- GET `/api/logs` without secret: 401.
- Authorized default POST reached Oxylabs but received provider authorization rejection. Returned 502 with `status: failed`, `error_code: provider_auth`, 1 source checked, 0 detail pages and 0 inserts. Provider calls stopped immediately, before processing Guardian.
- Run ID: `e4e521cb-4777-4afa-b710-8f578932587f`.
- Read-only Supabase verification confirmed `started`, `source_failed`, and `finished` rows with the final failed status, zero inserts and 3215 ms reported duration. Subsequent logging polish adds explicit sanitized failure codes and running status to new logs.

## Initial live blocker (resolved below)

The first run was blocked by incorrect `OXY_WSA_USERNAME` / `OXY_WSA_PASSWORD`. No articles were inserted by that rejected run. The user then updated the credentials and authorized continuation.

## Successful live retry

Run `d2299fb0-3ee9-4cbf-93fb-fcd5039326cd` returned HTTP 200 and exited verification with code 0:

```json
{
  "status": "completed",
  "sources_checked": 2,
  "candidates_found": 102,
  "candidates_rejected": 28,
  "duplicates_skipped": 18,
  "detail_pages_scraped": 10,
  "articles_inserted": 10,
  "articles_rejected": 0,
  "articles_failed": 0,
  "duration_ms": 55012,
  "rejection_reasons": { "candidate_url": 28 },
  "logging_failures": 0
}
```

Both BBC News and The Guardian inserted five articles in five detail attempts and reached the requested limit. Candidate duplicate counts include repeated homepage links, not only previously stored articles. Authenticated log reads returned 200 with start, both source-completion events and final completion. Unauthorized scraping/log reads returned 401, invalid limits 400 and GET scraping 405.

Read-only database verification found all ten new rows with title, source, original/canonical URL, image, publication date and body text. Bodies range from 2,707 to 8,106 characters; inspected beginnings/endings read as individual articles, although ordinary publisher reporting credits/support notices can remain. All ten have null `analyzed_at`. All ten URL pairs are recognized by the existing dedupe helper. No second paid scrape was needed to check those identities. No application code changed during this retry, so prior automated checks remain applicable.

The updated local environment omitted the admin secret; it was regenerated under the user's prior authorization without displaying it. Never include local credentials in this report.

## Repeating live verification

After configuring credentials, keep `npm.cmd run dev` running and execute:

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-scraping.ts
```

This performs paid scraping of both active sources with up to five valid new articles each, checks routes and logs, and reads saved article previews and dedupe results. Exact curl examples and expected responses are in README.md and the approved implementation prompt. Watch the dev-server terminal. New rows remain pending analysis and do not appear in the analyzed feed yet.
