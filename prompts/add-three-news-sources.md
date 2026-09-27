# Add NPR, Reuters and AP News

## Goal

Add the three user-selected sources to Supabase and make them usable by the existing manual Oxylabs pipeline, with source-specific URL filtering and extraction where needed.

Status: awaiting approval. No source rows or application code have been changed for this request.

## Skills read

- `.agents/skills/supabase/SKILL.md`
- `.agents/skills/web-scraper-api/SKILL.md`
- `AGENTS.md` and `PROJECT_MEMORY.md`

## Existing code inspected

- `lib/parsing/urls.ts`: only BBC, Guardian and conservative generic strategies exist. The global section-path reject rule must be refined carefully for legitimate NPR detail URLs under sections.
- `lib/parsing/articles.ts`: story-card selectors, metadata extraction, body cleanup and content gates.
- `lib/pipeline/scrape.ts`: active-source pagination, selected-source validation, shared processing and insertion limits.
- `lib/supabase/queries/sources.ts`: source read/write helpers.
- `supabase/seed.sql`: idempotent inserts preserving existing source settings.
- `tests/scraping.test.ts`, `package.json` and existing live verification flow.
- Live Supabase read confirmed BBC News and The Guardian active, plus one inactive fictional demo source; none of the requested additions exists.

## Decisions and assumptions

Use these exact user-provided entry URLs:

| Name | Stored listing_url | Parser strategy |
| --- | --- | --- |
| NPR | https://www.npr.org/sections/news/ | npr |
| Reuters | https://www.reuters.com/ | reuters |
| AP News | https://apnews.com/ | ap |

- NPR's supplied news section is explicitly authorized as its entry page. Fetch that entry only; never crawl other sections to discover stories. The entry itself remains an invalid article.
- Store URLs in Supabase/seed configuration; scraper logic reads them from active source rows rather than hardcoding listing URLs.
- Add three active rows and retain both existing active sources and the inactive demo unchanged.
- Scope includes enough parsing support and verification to establish working source additions, not merely rows that yield no candidates.
- Default verification is up to five valid new articles per new source (up to 15 total). Do not re-scrape BBC/Guardian solely for this verification.
- AI analysis, Scheduler and UI changes remain separate work. New articles stay pending analysis.
- Preliminary browser fetch could read AP's homepage; NPR was unavailable to the search browser due to robots restrictions, and Reuters could not be opened. These results do not establish Oxylabs availability. Inspect actual provider results after approval and report any access failures honestly.

## Files likely to change

- `lib/parsing/urls.ts`
- `lib/parsing/articles.ts`, with small source-specific modules if useful
- `supabase/seed.sql`
- `scripts/add-news-sources.ts` or an equivalent narrowly scoped idempotent source setup script
- `tests/scraping.test.ts` and compact sanitized structural fixtures
- `README.md`, `PROJECT_MEMORY.md`, verification report in `prompts/`
- Existing live verification script only if needed for selecting the three new source IDs

## Implementation requirements

1. Re-read this approved prompt. Refresh relevant Supabase docs/changelog before database writes. No schema alteration is expected; source rows use the existing table and types.
2. Inspect current source rows again to avoid duplicate registration. Add the requested entries using existing server-side persistence. Setup reruns must not reset existing source settings or create duplicate rows. If an existing matching row is inactive, preserve it and report the discrepancy instead of silently reactivating it.
3. Persist entry URLs before scraping them. Inspect each selected entry through the existing Oxylabs transport; use real returned markup to determine story-card selectors and article patterns. Do not infer successful parsing from search snippets or guessed HTML structures.
4. Add recognized `npr`, `reuters`, and `ap` strategies, with null-strategy hostname inference where consistent with existing patterns. Preserve strict publisher-host boundaries.
5. NPR: support observed date/ID-based story URLs, including legitimate dated detail paths under sections when present. Reject section landing pages, shows/programs, podcasts, live pages and audio-only entries without meaningful article text. Do not broadly exempt all `/sections/` paths from validation.
6. Reuters: accept observed article-specific dated/ID patterns; reject bare geographic/category/market landing pages, live coverage, video-only, author and corporate pages. Require article content, not access-denied/challenge/subscription text.
7. AP: accept observed `/article/` story identities; reject hubs, categories, navigation, video-only, live, games, press-release/promotional and other non-article pages. Confirm article body extraction does not concatenate unrelated cards.
8. Extract visible story-card/headline links only. Preserve exclusions for menus, headers/footers, hidden elements and promotions. Fetch no extra listing pages, sitemaps or unrelated source endpoints.
9. Require specific title, valid publication date, safe image URL, canonical article URL and meaningful cleaned body. Preserve the existing three-paragraph OR 900-character gate. Strip ads, subscription/newsletter, related links, captions, bylines/bios and markup noise as appropriate. Never fabricate missing fields to obtain five inserts.
10. Reuse original/canonical URL dedupe, chunks of at most 15 and append-only insert helpers. Keep the current attempt caps, safe error handling and progress logging. Do not duplicate pipeline orchestration.
11. Inspect saved article beginnings/endings and metadata for each source during a selected live scrape. Confirm null analyzed_at and re-check URL identities without another full paid scrape. If a source is unavailable, record its status and blocker; do not claim success, switch entry URLs, or weaken validation to conceal it.
12. Keep source registration and runtime code separated. No endpoint to mutate sources or extra UI is needed. Preserve all unrelated work.

## Security requirements

- All setup/database/provider operations are server-side; no credentials in output or committed files.
- Preserve RLS and existing service-role boundaries. No grants, table resets or schema changes are needed.
- Manual scraping continues to require `x-biasly-admin-secret`; source addition does not create an alternate unprotected scraping path.
- Validate candidate/final/canonical URLs and reject credentials, unsafe schemes, private hosts and off-publisher links.
- Never overwrite or delete existing articles or alter their analysis timestamps.

## Acceptance criteria

- Supabase and GET `/api/sources` show NPR, Reuters and AP News at the exact requested URLs alongside BBC/Guardian.
- New strategy values are recognized and appropriately narrow; existing BBC/Guardian tests remain green.
- Focused fixtures cover valid story cards and detail pages for each new source, plus category/live/non-article rejection, missing image/date and noisy body rejection.
- Source setup is idempotent and leaves existing source settings intact.
- A selected live run attempts only the three additions with up to five valid new inserts each. Final report provides actual counts, quality observations, dedupe evidence and any source-specific blockers.

## Checks to run

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd run test:scraping`
- `npm.cmd run test:data`
- `npm.cmd run build` because server-imported parsing modules change
- Read-only Supabase verification of source rows, new articles and run logs. No live test may delete/reset existing data.

## Exact manual test steps

1. Keep configured Supabase/Oxylabs/admin credentials in ignored `.env.local`. Run `npm.cmd run dev` and watch its terminal.
2. Set `$env:BIASLY_ADMIN_SECRET` to the existing local admin secret in another PowerShell terminal.
3. List sources and obtain the new UUIDs:

```powershell
curl.exe -i http://localhost:3000/api/sources
```

4. Copy the actual new IDs from that output. Run the selected paid scrape (replace the three placeholders):

```powershell
$sourceIds = @('<NPR_UUID>', '<REUTERS_UUID>', '<AP_UUID>')
$body = @{ sourceIds = $sourceIds; limitPerSource = 5 } | ConvertTo-Json -Compress
$body | curl.exe -i -X POST http://localhost:3000/api/scrape -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'
```

5. Read operational logs:

```powershell
curl.exe -i 'http://localhost:3000/api/logs?limit=20' -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
```

6. Check Supabase articles ordered by scraped_at, with source IDs restricted to the additions. Inspect title/image/date/body and confirm pending analysis timestamps. Existing articles must remain intact. Fewer than five valid inserts can be correct; zero candidates or access errors require an explicit explanation.
7. Delivery must include executable commands with the actual persisted source UUIDs. Homepage publication still requires the separate AI analysis step.
