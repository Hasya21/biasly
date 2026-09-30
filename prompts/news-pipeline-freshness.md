# Restore automatic publication of new stories

## Goal
Ensure scheduled ingestion and analysis make progress across all five active sources and publish fresh, valid stories within the deployed function budget.

## Evidence and existing code inspected
- Live Supabase logs show successful cron invocations on September 28 and 29, 2026. Each inserted 10 articles, but all 20 remain without analysis and cannot appear on the homepage.
- Analysis repeatedly starts with the oldest pending articles. Invalid output failures consume the available time before recently inserted articles are reached; 35 articles are pending.
- Sequential source processing reaches AP News and BBC News before its 100-second budget prevents starting NPR, Reuters, and The Guardian.
- Inspected `lib/pipeline/{cron,analyze,scheduled-results,budget,limits}.ts`, AI generation and validation modules, Supabase article queries and pending RPC, and homepage query/rendering.
- The homepage is dynamically rendered and queries stored analyzed articles. An already open tab has no polling; this is separate from the confirmed publication failure.

## Skills read
- `.agents/skills/supabase/SKILL.md`
- `.agents/skills/ai-sdk/SKILL.md`
- Read `.agents/skills/web-scraper-api/SKILL.md` and relevant local Next.js documentation before implementation. Consult current Oxylabs Scheduler documentation if provider behavior changes.

## Decisions and assumptions
- Preserve all five active sources and up to five new valid articles per source; never increase paid scraping limits to compensate for failed analysis.
- Preserve the current daily Vercel Hobby trigger and 300-second function ceiling. Hourly Vercel execution requires a separately authorized hosting/scheduling change.
- A bounded request cannot guarantee completion when providers are slow. Deferred work must remain eligible and receive fair service on subsequent runs.
- Do not add client polling as a substitute for fixing publication.

## Implementation requirements
1. Prevent old failing analysis items from monopolizing every invocation. Use durable retry eligibility/progress with bounded backoff, and fair allocation between fresh pending articles and older backlog. Keep default manual analysis capable of processing all eligible pending articles; preserve explicit IDs/limits and embedding backfill.
2. Persist progress across invocations and continue to detect pending work from actual analysis/embedding state, not `analyzed_at` alone. Avoid unbounded scans of logs to implement scheduling.
3. Give every active source a fair opportunity within the scraping budget. Use a small bounded worker pool and/or durable fair ordering; preserve per-source limits, job claims, leases, fencing, URL dedupe, article validation, and deadline cleanup. Do not promise every source finishes in every request.
4. Record safe categorical validation failure reasons and use actionable retry feedback. Preserve strict output, percentage, sentiment, framing, and evidence validation. Never publish invalid output merely to clear the queue.
5. Always attempt the analysis phase after scraping fails. Reserve sufficient time for persistence and cleanup; keep provider calls abortable.
6. Expose useful completion/deferred/retry and deadline information in server logs, without raw model responses or article text.
7. If database state is required, update schema, types, and a separate migration; read the applicable database skill before SQL edits. Apply and verify the migration before live testing. Preserve existing data.
8. Update operational documentation to describe the deployed daily frequency and retry/progress behavior accurately.

## Likely files
- `lib/pipeline/analyze.ts`, `cron.ts`, `scheduled-results.ts`, and centralized limits
- `lib/ai/analyze-article.ts`, `analysis-schema.ts`
- `lib/supabase/queries/articles.ts`, relevant persistence queries and types
- `supabase/schema.sql` and a focused upgrade SQL file if needed
- Relevant pipeline tests, README, and PROJECT_MEMORY

## Security
Keep credentials server-only; preserve admin-header authentication and production cron bearer authentication. Do not change secrets, create extra provider schedules, delete articles, or weaken validation. Live verification must be bounded and must not overlap scheduled processing.

## Acceptance criteria and checks
- Repeated invocations with failing old articles still analyze fresh eligible articles and advance older eligible backlog.
- All five sources can make progress across constrained invocations; AP/BBC cannot permanently starve the rest.
- Failed articles remain retryable with bounded backoff; successful analysis plus embedding enables homepage visibility.
- Tests cover cross-invocation fairness, repeated failures, deadlines, concurrent source limits/claims, and analysis after scrape failure.
- Run `npm.cmd run typecheck`, `npm.cmd run lint`, relevant existing tests, and `npm.cmd run build`. Report actual results.
- Verify a bounded live recovery publishes at least one recent pending article, then compare database state and the deployed homepage after deployment. Distinguish local changes from deployed behavior.

## Manual test steps
Start `npm.cmd run dev` and watch its terminal for pipeline progress. Supply the existing admin secret through the calling terminal environment without printing it.

```powershell
curl.exe -i -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H "Content-Type: application/json" --data-raw '{}'
curl.exe -i http://localhost:3000/api/cron/pipeline
curl.exe -i http://localhost:3000/api/logs -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"
```

Run these sequentially, not concurrently. Check that newly analyzed articles appear after refreshing the homepage and that summaries explain deferred work. In production, verify an unauthenticated cron request returns 401, trigger an authorized run from Vercel's Cron controls, and inspect the next scheduled run for continued progress. Do not put `CRON_SECRET` in `.env.local`.
