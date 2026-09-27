# AI article analysis pipeline

## Goal
Implement section 19 of AGENTS.md: analyze valid stored articles with OpenAI through the Vercel AI SDK, validate the results, save them in Supabase, and publish them through the existing reader queries. Add an admin-protected POST /api/analyze and reusable server-only orchestration.

## Skills read and documentation
- `.agents/skills/supabase/SKILL.md`.
- `.agents/skills/ai-sdk/SKILL.md`.
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.
- Supabase RPC reference: https://supabase.com/docs/reference/javascript/rpc.
- Before implementation, retrieve the Supabase changelog (the web reader rejected its markdown content type), verify relevant changes, and read installed AI SDK/provider documentation after installation. The AI SDK and OpenAI provider are not currently installed. Verify current model availability rather than guessing a model ID.

## Existing code inspected
- `AGENTS.md`, `PROJECT_MEMORY.md`, `package.json`, `.env.example`.
- `lib/supabase/types.ts`, `validation.ts`, and queries for articles, analyses, and logs.
- `supabase/schema.sql`: existing LEFT JOIN pending-selection RPC and atomic analysis-save RPC.
- `lib/api/admin.ts`, `app/api/scrape/route.ts`, `lib/pipeline/scrape.ts`.
- `lib/parsing/articles.ts` and `tests/supabase.test.ts`.

## Decisions and assumptions
- Reuse `getPendingArticles` and `saveArticleAnalysis`. The database already derives bias_score and atomically sets analyzed_at after saving validated analysis. No schema change is expected.
- Default request processes all pending valid articles, in configurable batches (ANALYSIS_BATCH_SIZE defaults to 5). It must not stop after five or ten total articles.
- Optional `limit` is a positive integer limiting pending articles attempted in this invocation; optional `articleIds` restricts selection to supplied UUIDs. Both can be combined. Reject unknown request fields and empty ID arrays.
- Advance the existing stable scraped_at/id cursor for every attempted article, including failures, so unsuccessful rows cannot create an infinite loop. Failed rows remain eligible on later runs. Report an incomplete/partial outcome if failures remain.
- Existing analysis rows are preserved. Missing analysis rows qualify even if analyzed_at is already set.
- pgvector, embeddings, related articles, Scheduler, and Cron belong to later scoped work per PROJECT_MEMORY.md. Existing UI already consumes stored analysis; no visual redesign is needed.
- Preserve all existing uncommitted work.

## Files likely to change
- New `app/api/analyze/route.ts`.
- New server-only `lib/ai/` modules for model configuration, prompt, schema, validation, and generation.
- New `lib/pipeline/analyze.ts` and analysis limits/configuration as needed.
- `package.json`, `package-lock.json`, `.env.example`, README.md, PROJECT_MEMORY.md.
- `tests/analysis.test.ts` and an optional narrowly scoped verification script.
- Existing Supabase query/validation/log helpers only when needed for this integration. Keep schema and types synchronized if an evidence-backed change becomes necessary; apply and verify any required database SQL before live testing.

## Implementation requirements
1. Install pinned compatible `ai` and `@ai-sdk/openai` packages, retaining Zod 4 and existing dependencies. Read their version-matched documentation before using APIs. Select a current cost-conscious OpenAI model supporting structured output and record the actual model name on every saved analysis.
2. Keep the route thin: Node runtime, requireAdmin first, bounded request body, strict Zod request validation, call orchestration, return a typed no-store JSON summary. Empty body and `{}` use defaults. Missing/invalid secret returns 401, malformed input 400, oversized payload 413, unsupported GET 405. Return safe errors only.
3. Export reusable `runAnalysis` for later scheduler integration. Validate configuration, then iterate pending pages until exhausted or an explicit limit is reached. Bound concurrency and each provider request duration; do not launch an unbounded Promise.all. Do not use fire-and-forget work after responding. Document hosting duration constraints accurately; batching alone does not remove a platform request timeout.
4. Revalidate stored input with existing article validation before spending tokens. Never scrape or fetch URLs during analysis. Reject invalid or oversized input with a safe reason instead of silently analyzing truncated text as a full article.
5. Generate neutral summary, sentiment score/label, political framing label, left/center/right percentages, confidence, framing notes, and loaded terms. Use a fixed application disclaimer explaining that framing is AI-estimated and may be inaccurate. Persist it with the analysis and actual model name.
6. Ground framing in article text only. Do not infer political leaning from publisher identity. Distinguish negative subject matter from political framing. Require weak evidence to yield unclear/low confidence; use mixed when evidence is close. Define and test deterministic consistency rules for directional labels, confidence, and close percentages.
7. Validate all output with Zod and application checks: finite scores, valid enums, nonempty summary/notes where appropriate, bounded arrays/text, percentages each 0–100 summing to 100, confidence 0–1, sentiment -1–1. Keep loaded terms grounded in the article text. The database computes `(right_percentage - left_percentage) / 100`; do not trust a model-produced bias score.
8. Retry invalid structured output once. Bound transient transport retries independently so retries cannot multiply without a clear cap. Fail safely on refusals, invalid output, timeouts, and provider errors. Stop repeated calls on fatal credential/quota errors. Continue past isolated article failures.
9. Save only validated output with `saveArticleAnalysis`. Never separately set analyzed_at or overwrite existing analysis. Preserve atomicity/idempotency and explain that concurrent invocations may still incur duplicate model calls although persistence remains safe.
10. Log start, batch progress (analyzed/skipped/failed), safe per-article failures, and final summary to console and Supabase logs. Use fixed messages and existing safeContext rules. Logging failures must be counted and must not undo saved analyses. Return run_id, status, counts, batches, duration_ms, logging_failures and safe failure categories as appropriate.
11. Document configuration and exact commands. Add a focused analysis test script and verification notes with actual results. Do not invent successful live verification when credentials/network are unavailable.

## Security requirements
- All provider/database/orchestration modules are server-only. OPENAI_API_KEY, service-role credentials and BIASLY_ADMIN_SECRET never reach browser code, logs, responses, or committed files.
- Treat article text as untrusted data: clearly delimit it and instruct the model to ignore embedded commands. No tools, browsing, or actions are available to the model.
- Keep RLS and existing revoked public grants intact. Use the existing service-role client only behind server authorization. Do not add Supabase Auth.
- Reuse the admin header, never query-string secrets. Do not expose article bodies, provider payloads, or raw exceptions in operational logs.

## Acceptance criteria
- Unauthorized calls make no model/database mutation calls.
- A full run processes more than one batch, with no hardcoded total limit; limited and selected-ID runs respect their selection.
- An article with non-null analyzed_at but no analysis row is picked up. Existing analyses are untouched.
- Invalid articles/output cannot publish; invalid model output receives exactly one validation retry. One failed article does not block later valid rows or loop forever.
- Successful persistence creates one complete analysis and sets analyzed_at atomically. Percentages and derived bias score meet constraints.
- Empty runs return a clean zero-count summary. Fatal errors and logging failures are represented honestly.
- Newly analyzed stored articles appear in the existing homepage feed and Clerk-protected detail view with AI-estimated framing, summary, sentiment, percentages, confidence, notes, terms, and disclaimer.

## Checks to run
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run test:data`
- `npm run test:db`
- New focused analysis tests covering authorization, input/output gates, multiple batches, selection limits, cursor advancement on failures, retry limits, atomic persistence failure, empty runs, and safe logging.
- Read-only live Supabase pending-selection verification; a limited one-article live analysis smoke test when configured, followed by reads confirming persistence and publication. Do not run the full paid backlog as an incidental test.
- Record exact command output and any blockers in `prompts/ai-analysis-verification.md`.

## Exact expected manual test steps
1. Set OPENAI_API_KEY and existing Supabase/admin variables in ignored `.env.local`. Optionally set ANALYSIS_BATCH_SIZE=5. Do not add CRON_SECRET locally. Start `npm run dev` and watch that terminal for analysis progress.
2. In another PowerShell terminal set `$env:BIASLY_ADMIN_SECRET` to the configured admin secret without committing it.
3. Unauthorized request, expected 401:
   `curl.exe -i -X POST http://localhost:3000/api/analyze -H 'Content-Type: application/json' --data-raw '{}'`
4. One-article smoke test, expected one attempted pending article at most:
   `'{"limit":1}' | curl.exe -i -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'`
5. Selected article (replace UUID with a real stored article ID):
   `'{"articleIds":["REPLACE_WITH_ARTICLE_UUID"]}' | curl.exe -i -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-binary '@-'`
6. Full pending backlog, intentionally incurs model calls for all valid pending articles:
   `curl.exe -i -X POST http://localhost:3000/api/analyze -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET" -H 'Content-Type: application/json' --data-raw '{}'`
7. Repeat the full request: successfully analyzed rows should not be processed again; unresolved failures may be retried. Inspect terminal summaries and admin logs:
   `curl.exe -i http://localhost:3000/api/logs -H "x-biasly-admin-secret: $env:BIASLY_ADMIN_SECRET"`
8. Confirm Supabase article_analyses fields and articles.analyzed_at agree, then refresh `/`, open a newly analyzed story, sign in through Clerk, and inspect the full stored analysis. Validate invalid limit returns 400 and GET `/api/analyze` returns 405.

## Approval
Prepared for user review. Implementation starts after approval as required by AGENTS.md section 2.
