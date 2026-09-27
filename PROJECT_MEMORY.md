# Project memory

## Vercel Hobby compatibility correction — 2026-09-27

- Deployment reported Hobby's 300-second maximum. Both previously 800-second scheduler route exports are now 300. Shared work budgets are 100 seconds for Cron scraping, 220 seconds for Cron analysis/standalone processing, and 270 seconds for the complete scheduler request. Cleanup can bypass the work deadline but cannot extend the enclosing request deadline; leases expire automatically if release fails.
- The user had already changed `vercel.json` to `15 0 * * *`; preserve that daily configuration. It is nominally 00:15 UTC with Hobby's hour-level scheduling precision. Live Oxylabs collection remains hourly. Deferred work resumes at the next invocation, not necessarily next hour. Daily work may leave a backlog.
- Earlier hourly/800-second deployment notes below describe the original implementation, not the current deployment configuration. No live schedules, secrets, database schema or provider settings changed for this correction.

## Oxylabs Scheduler and hourly Cron — 2026-09-27

- Implemented schedule sync/status, done-only scheduled-result processing, run history, and `GET /api/cron/pipeline`. `vercel.json` registers `15 * * * *` UTC; Oxylabs uses `0 * * * *`. User selected all five active sources and five new valid articles per source per cycle.
- `supabase/oxylabs-scheduler.sql` was applied by the user and verified live. It adds `oxylabs_schedules.listing_url` and private `pipeline_leases` with service-role-only acquire/release RPCs. The full schema and TypeScript types match. Leases last 15 minutes; external calls run outside short DB transactions.
- Five live Oxylabs schedules are active: AP News `3799622819986961747`, BBC News `281292664797876641`, NPR `2451798172679820561`, Reuters `2084467568837037572`, The Guardian `2221276256344645580`. Repeat sync reused all five with identical IDs, zero creations/failures. Scheduled scraping continues independently of local development.
- Sync assumes the configured Oxylabs account is dedicated to this app: it deactivates remote schedules absent from the complete stored set. It replaces changed source URLs and schedules within seven days of their one-year expiry. Raw provider JSON integer tokens become strings before parsing; ID precision is never lost.
- Processing reuses `processHomepage`, append-only insertion, and 15-URL dedupe chunks. Unique job claims skip completed/in-flight work; failed or 15-minute-stale jobs are conditionally reclaimed using started_at ownership fencing. A result fetch returning 404 remains failed and is not retried forever.
- Runtime budgets propagate to DB, Oxylabs and AI requests. Cron reserves an independent analysis phase even after processing failure, including old backlog and embedding backfills. Deferred work remains eligible next hour. Manual full analysis keeps its existing behavior.
- Hosted schema/lease exclusivity/owner fencing/anonymous RPC denial passed. Live processing run `9f4beb96-a656-4530-a35f-9157355552aa` checked five sources without failures; there were no completed provider jobs yet. Scheduled article ingestion still needs verification after the first hourly run.
- Production deployment is pending: configure `CRON_SECRET` in Vercel (never `.env.local`) and deploy on Pro/Enterprise. Only local development bypasses Cron authorization. No deployment was performed against the existing dirty working tree.
- Verification and exact commands: `prompts/oxylabs-scheduler-verification.md`, README hourly scheduler section, `scripts/verify-scheduler.ts`. Offline scheduler tests cover transport/precision, synchronization, claims/deadlines, security, and analysis-after-processing-failure.

## pgvector and related articles — 2026-09-24

- Local implementation is complete for `text-embedding-3-small` (1536 dimensions), embedding-only backfill, atomic new analysis+embedding saves, server-only cosine related lookup, and the responsive Related Articles details section.
- Pending selection now includes missing analysis rows and existing analyses with `embedding IS NULL`; `needs_analysis` and the saved summary distinguish full analysis from backfill. Backfills never regenerate or overwrite analysis fields.
- `supabase/schema.sql` is updated and `supabase/pgvector-related-articles.sql` is the existing-project Dashboard upgrade. It enables `vector` in `extensions`, adds the nullable vector column and IVFFlat cosine index, replaces pending/save RPCs, adds embedding backfill and related-match RPCs, and grants execution only to `service_role`.
- The Dashboard upgrade has been applied. Live verification passed for schema access, anonymous read denial, 1536-dimensional vector storage, embedding-only backfill, and cosine matching. Two analyzed articles have embeddings and the related lookup returned the other article as one distinct result. Backfill runs `4fc76248-e970-4c60-bc5c-723724f962a1` and `e1be39d1-533a-4059-87b0-ff9b0ed76d33` completed without failures.
- The related-match RPC sets `ivfflat.probes = 100` because the required IVFFlat index uses 100 lists; this prevents empty approximate scans while the vector table is small.

## AI article analysis — 2026-09-24

- `POST /api/analyze` is implemented with the admin header, strict bounded options, and server-only Vercel AI SDK/OpenAI structured generation. Default processes all pending rows; optional `limit` caps attempts and `articleIds` restricts selection. ANALYSIS_BATCH_SIZE defaults to 5 (1–100).
- `lib/pipeline/analyze.ts` reuses the LEFT JOIN pending RPC and atomic save RPC. Cursor advancement includes failures. Existing analyses are preserved; failed rows remain eligible next run. No database migration was required.
- `gpt-5.4-mini` records the actual response model ID. Output is validated for scores, percentage sum, label/confidence consistency, and loaded-term evidence. One validation retry; no transport retries; 90 seconds per call; access/quota errors stop the run. Inputs over 60,000 title/body characters are skipped, never silently truncated.
- Live one-article verification saved `da120eff-62eb-46de-90f3-84233f6f4d8a` in run `6e76c476-0235-4f46-8af8-396a81134f83`, using `gpt-5.4-mini-2026-03-17`. Analysis fields, derived bias score, publication query and repeat-run skip were verified. The remaining backlog was not analyzed as part of this test.
- Full synchronous runs remain subject to host request timeouts; limited requests are available. Concurrent calls can duplicate provider spend but cannot overwrite saved analysis. Logs contain safe counters/categories only. Embeddings and scheduler integration remain separate follow-ups.

## Additional news sources — 2026-09-24

- NPR (`https://www.npr.org/sections/news/`), Reuters (`https://www.reuters.com/`) and AP News (`https://apnews.com/`) are active, with `npr`, `reuters`, `ap` parser strategies. BBC/Guardian and the inactive demo are preserved. NPR's user-specified section is an authorized entry page, not an article or permission to crawl other section pages.
- Parser rules were based on observed Oxylabs markup: NPR `article .title` and `#storytext`; Reuters `TitleLink` and `paragraph-*` divs; AP `PagePromo-title` and `RichTextStoryBody`. NPR dated section article URLs receive a narrow exemption from section landing rejection; podcast cards remain excluded.
- `scripts/add-news-sources.ts` idempotently registers the three configured sources, preserving existing settings. `scripts/verify-scraping.ts` accepts optional selected source UUID arguments.
- Live run `0dea3615-47b7-4b9d-bac1-e46445f2e877` saved 15 articles (five per addition), zero failures, about 145 seconds. All saved URL identities were recognized by dedupe; image/date/body fields and null analyzed_at were verified. Full AI analysis is still required before homepage publication.

## Manual scraping — 2026-09-23

- `POST /api/scrape` is implemented with server-only Oxylabs Realtime transport, Cheerio parsing, strict Zod options and `x-biasly-admin-secret` protection. Defaults to all active stored sources and five valid new articles each. GET `/api/sources` exposes selected public source fields; GET `/api/logs` requires the admin header.
- `lib/pipeline/scrape.ts` owns orchestration; `processHomepage` accepts HTML for future Scheduler reuse. Source strategies are BBC, Guardian and conservative generic. Storage reuses existing append-only and cross-column dedupe helpers. No schema change or analysis is performed.
- New rows stay pending analysis. Run summaries distinguish failures, rejected pages, duplicates and bounded attempts. Provider authorization errors stop subsequent provider requests. Raw provider errors and credentials never enter logs.
- A generated admin secret was saved in ignored `.env.local` with user authorization and restored after the user's credential update omitted it. Initial Oxylabs authorization failure was resolved with updated credentials. Live run `d2299fb0-3ee9-4cbf-93fb-fcd5039326cd` completed: five BBC and five Guardian articles inserted, zero failures, 55 seconds. Saved metadata, body previews, pending analysis timestamps and URL dedupe were verified. These articles remain invisible in the analyzed feed until AI analysis is implemented and run.

## Supabase data-layer conventions — 2026-09-23

- All application database reads and writes use `getSupabaseAdmin()` in `lib/supabase/server.ts`, with the service-role key confined to `server-only` modules. Reader UI receives selected data from the server; never initialize a service-role client in the browser.
- RLS is enabled on all six core tables with **no anon/authenticated policies**. Public/anon/authenticated table privileges are revoked intentionally. Do not fix an access error by adding public policies, granting browser access, or using Supabase Auth. Check server credentials, schema installation and grants instead. Service role bypasses RLS; callers must enforce Clerk/admin authorization themselves.
- External Oxylabs schedule, run and job identifiers are PostgreSQL `text` and TypeScript strings. Extract large numeric IDs from raw provider response text before JSON parsing; never route them through a JavaScript number. Internal primary keys and foreign keys remain PostgreSQL UUIDs represented as strings in TypeScript.
- Reuse `lib/supabase/queries/` for pipeline persistence. Articles are append-only; original/canonical URL collisions are checked across both columns, with at most 15 URLs per `.in()` filter. Inserts use READ COMMITTED and the database URL guard. Duplicate inserts never replace stored articles.
- Use `saveArticleAnalysis` / `save_article_analysis` to save valid analysis and mark completion atomically. The database derives bias score. Pending selection is based on absence of an analysis row, not `analyzed_at` alone.
- Only active stored sources may be scraped/scheduled. Demo fixtures must use inactive sources. External IDs and private operational data must not leak into public presentation unnecessarily.
- Keep `supabase/schema.sql` and `lib/supabase/types.ts` synchronized. RLS without policies is intentional for this server-mediated design; do not disable it to silence an advisor warning.
- This initial schema has no embeddings. Add pgvector/backfill only in its explicitly scoped follow-up.

## UI follow-up — 2026-09-23

The product represents one article from one publisher. Its framing percentages describe the article text, not a distribution of publishers or a publisher's political leaning. The approved `prompts/single-article-framing-sidebar.md` is implemented: “About this article” displays one publisher and the publication date, with a safe original-article link only when supplied. Keep the main framing chart and article evidence separate from publisher identity.

Live-data integration is now implemented: `/` reads paginated published articles from Supabase at request time; `/news/[id]` uses UUIDs. A minimal public identity query checks existence before Clerk protection; full text and full analysis are read only after `auth.protect()`. Middleware supplies Clerk context without a static sample-ID allowlist. Unknown/unpublished articles return 404. No sample fallback, fabricated topics/categories or sample related stories are shown. The design-system route remains an isolated preview. `manual-demo-fixture` rows keep explicit demo labels and their stored disclaimers. Browser-loaded images use unoptimized Next Image with a fallback; no broad server image proxy is enabled.
