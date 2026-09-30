# Publication freshness verification — 2026-09-29

Approved implementation: `prompts/news-pipeline-freshness.md`.

## Changes
- Durable analysis claims and retry backoff, with alternating fresh/backlog selection across requests. Claims expire after ten minutes; failed attempts wait 15 minutes, doubling up to seven days. Strict validation is preserved and retry feedback identifies the failed constraint.
- Least-recently-attempted source ordering persists before provider work. Sequential processing preserves source/job limits and gives previously deferred sources priority next invocation.
- Manual analysis uses bounded work/request deadlines and exports `maxDuration = 300`. The production build manifest reports 300 for analysis and all three scheduler routes. Daily Hobby Cron remains `15 0 * * *`.
- Updated schema/types, operational documentation, and a bounded live verification script. No source URLs, provider schedules, credentials or existing articles were replaced.

## Checks and output

`npm.cmd run typecheck` — exit 0:
```text
> skewed_news@0.1.0 typecheck
> tsc --noEmit
```

`npm.cmd run lint` — exit 0, no diagnostics:
```text
> skewed_news@0.1.0 lint
> eslint
```

`node --conditions=react-server --import tsx --test tests/freshness.test.ts tests/analysis.test.ts tests/scheduler.test.ts` — exit 0:
```text
ℹ tests 27
ℹ suites 0
ℹ pass 27
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 13982.5686
```

`npm.cmd run test:freshness` also passed after final migration synchronization (1 test, 0 failures). Tests cover repeatable upgrades, private grants, one-item cross-request fairness, cooldown/backoff cap, interruption recovery, claim fencing, embedding NULL eligibility, source fairness under deadlines, validation feedback, and analysis after scraping failure.

The bundled PGlite lacks pgvector. The queue test loads the existing table definitions with an array substitute for the embedding column; it runs the exact upgrade SQL and tests NULL eligibility, not vector operations. An initial full-schema test exposed this environment limitation; the final targeted queue test passes. Real embedding persistence was verified live below.

`npm.cmd run build` — exit 0; relevant output:
```text
▲ Next.js 16.3.4 (Turbopack)
✓ Compiled successfully in 36.2s
  Finished TypeScript in 11.6s
✓ Generating static pages using 7 workers (13/13) in 1650ms
```
The build emitted an existing warning about ignoring `C:\Users\Dell\package-lock.json` outside the Git repository. No build errors. `git diff --check` passed.

## Live verification

The user applied `supabase/news-pipeline-freshness.sql`. Then:
```powershell
node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-news-freshness.ts --recover
```
Exit 0. Exact success messages:
```text
PASS: live migration, pending selection, and anonymous denial { eligible_up_to_100: 35 }
PASS: recent article published with embedding; repeat skipped {
  article_id: 'a0a6647f-b7e9-4b52-9fb9-33c1adf25134',
  scraped_at: '2026-09-29T00:43:45.019664+00:00'
}
```
Recovery run `979d377d-e732-4f98-9cb5-dfe056ef0474`: attempted 1, analyzed 1, embeddings saved 1, failed 0, 26,729 ms. Repeat run `7fbca7cd-56c9-4f26-bd64-e0dc371d55dd`: attempted 0. The existing Cron lease prevented overlapping Cron work during recovery. The published-article database query returned the recovered article.

## Remaining production step

Deploy these repository changes to Vercel. No Git push or deployment was performed. The public production URL was not supplied, so browser rendering and the next deployed Cron invocation are not yet verified. SQL alone does not update the deployed worker.

After deployment, use Vercel's Cron Run control and inspect the `scheduler_finished`/`analysis_finished` events. Refresh the homepage; it does not poll automatically. Continue using the exact local curl commands in the approved prompt; watch the Next.js terminal for progress. A daily run can remain partial when providers are slow; deferred work receives future turns.
