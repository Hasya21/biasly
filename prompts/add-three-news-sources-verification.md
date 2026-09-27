# Three-source verification — 2026-09-24

Implemented the approved prompt. Added the exact NPR, Reuters and AP entry URLs, source-specific filtering/body parsing, seed entries, idempotent registration and selected-source live verification. No schema changes, credentials printed, or existing article updates/deletions.

| Source | ID | Strategy | Live inserts |
| --- | --- | --- | --- |
| NPR | 25865f99-b194-458d-b0e0-07a25e87ec62 | npr | 5 |
| Reuters | 131db4e8-90a4-4a86-8a78-06ec32d9ab0d | reuters | 5 |
| AP News | ef6507c4-38a7-49ef-9a1f-82907a7d12ab | ap | 5 |

Registration was run twice. The second run reported `action: preserved` for all three, with the same IDs/settings. GET `/api/sources` returned all five active sources; the fictional demo remains excluded.

Actual provider HTML informed the selectors. Three entry pages and four detail-page inspection calls preceded the live run. One Reuters inspection redirected to a picture page, so the parser uses the observed primary `TitleLink` story cards and excludes picture pages. No inspected pages were inserted outside the live pipeline.

## Live result

Run `0dea3615-47b7-4b9d-bac1-e46445f2e877`, HTTP 200, verification exit 0:

```json
{
  "status": "completed",
  "sources_checked": 3,
  "candidates_found": 246,
  "candidates_rejected": 26,
  "duplicates_skipped": 10,
  "detail_pages_scraped": 15,
  "articles_inserted": 15,
  "articles_rejected": 0,
  "articles_failed": 0,
  "duration_ms": 144826,
  "rejection_reasons": { "candidate_url": 26 },
  "logging_failures": 0
}
```

All three sources reached five inserts in five detail attempts. Duplicate counts include repeated entry-page links. Read-only verification recognized all 15 stored URL identities, confirmed image/date/title/source/body fields, and found null `analyzed_at` throughout. Body lengths range from 2,506 to 7,186 characters. Inspected beginnings/endings are individual articles; occasional publisher contributor credits and Reuters link-accessibility wording remain. No article contains an observed whole-page/navigation dump in the inspected previews. This is representative live verification, not a guarantee against future publisher markup changes.

Logs include start, three source completions and final completion. Authorization checks returned 401 for unauthenticated scrape/log requests, 400 for an invalid limit, and 405 for GET scraping. Neither BBC nor Guardian was selected in this run. New articles remain pending AI analysis and are not yet published in the analyzed feed.

## Checks

`npm.cmd run typecheck`: exit 0, `tsc --noEmit`, no diagnostics.

`npm.cmd run lint`: exit 0, `eslint`, no diagnostics.

`npm.cmd run test:scraping`: exit 0:
```text
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

The new test covers each observed card/body structure, valid article paths, forbidden/off-publisher paths, missing metadata, noisy/short body rejection, NPR section detail paths and podcast exclusion. Existing BBC/Guardian tests remain passing.

`npm.cmd run test:data`: exit 0:
```text
ℹ tests 3
ℹ pass 3
ℹ fail 0
```

`npm.cmd run build`: exit 0:
```text
✓ Compiled successfully in 16.2s
Finished TypeScript in 24.7s
✓ Generating static pages using 7 workers (8/8) in 1890ms
```
The existing warning about `C:\Users\Dell\package-lock.json` outside the repository persists. `git diff --check` exited 0 with only Windows line-ending notices.

## Manual test

Run `npm.cmd run dev`. In another PowerShell terminal set `$env:BIASLY_ADMIN_SECRET` to the configured local value, then:

```powershell
curl.exe -i http://localhost:3000/api/sources
$body = @{ sourceIds = @('25865f99-b194-458d-b0e0-07a25e87ec62', '131db4e8-90a4-4a86-8a78-06ec32d9ab0d', 'ef6507c4-38a7-49ef-9a1f-82907a7d12ab'); limitPerSource = 5 } | ConvertTo-Json -Compress
$body | curl.exe -i -X POST http://localhost:3000/api/scrape -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'
curl.exe -i 'http://localhost:3000/api/logs?limit=20' -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
```

This makes paid Oxylabs requests and may insert up to 15 further new articles. Watch the dev-server terminal for progress. To run the automated live verification instead:

```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-scraping.ts 25865f99-b194-458d-b0e0-07a25e87ec62 131db4e8-90a4-4a86-8a78-06ec32d9ab0d ef6507c4-38a7-49ef-9a1f-82907a7d12ab
```
