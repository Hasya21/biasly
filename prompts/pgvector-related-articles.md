# pgvector embeddings and related articles

## Goal
Enable Supabase pgvector, store a 1536-dimensional OpenAI embedding with every article analysis, backfill embeddings without regenerating existing analysis, and show up to five semantically related analyzed articles on the protected news details page.

## Skills and documentation read
- Read `AGENTS.md` and `PROJECT_MEMORY.md`.
- Read `.agents/skills/supabase/SKILL.md` and followed its current-documentation requirement.
- Read `.agents/skills/ai-sdk/SKILL.md` because this change adds an AI SDK embedding call.
- Read the current Supabase changelog (2026-09-24), vector column documentation, and semantic-search documentation. Relevant findings: enable `vector` without a pinned extension version; Supabase recommends `extensions.vector(n)`; PostgREST does not expose pgvector distance operators directly, so similarity search needs an RPC; cosine queries must order by the distance expression for index use; new Data API exposure defaults do not change this existing locked-down server-mediated design.
- Read version-matched AI SDK 7.0.113 and `@ai-sdk/openai` 4.0.74 bundled documentation/source. Verified `embed({ model: openai.embedding(...), value, maxRetries, abortSignal })`; `text-embedding-3-small` defaults to 1536 dimensions.
- Read the installed Next.js 16 server data-fetching and server/client boundary documentation.

## Existing code inspected
- Analysis: `app/api/analyze/route.ts`, `lib/pipeline/analyze.ts`, `lib/ai/analyze-article.ts`, `lib/ai/analysis-schema.ts`, `tests/analysis.test.ts`.
- Supabase: `supabase/schema.sql`, `supabase/verify.sql`, `lib/supabase/server.ts`, `lib/supabase/types.ts`, `lib/supabase/validation.ts`, `lib/supabase/queries/analyses.ts`, `lib/supabase/queries/articles.ts`, `tests/supabase.test.ts`, and `scripts/verify-supabase.ts`.
- Presentation: `app/news/[id]/page.tsx`, `lib/news/load-article.ts`, `lib/news/presentation.ts`, `components/news-details/article-details.tsx`, `components/news-details/details.module.css`, and the existing responsive related-story CSS.
- Environment and tooling: `.env.example`, `package.json`, installed package versions, and the `supabase/` directory. The project has an initial canonical schema and Dashboard SQL workflow, no `supabase/migrations/` declarative workflow, no configured Supabase MCP SQL tool, and no Supabase CLI binary.

## Decisions and assumptions
- Use OpenAI `text-embedding-3-small` with its native 1536 dimensions, matching `AGENTS.md` section 20. Keep `OPENAI_API_KEY`; no new environment variable is needed.
- Embed a stable semantic representation built from the article title and saved neutral summary. This remains well within the embedding model context window and lets new and existing analyses use identical input construction. Generate analysis first when missing, then embed its validated summary; embedding-only backfills use the stored summary and do not spend another text-generation call.
- Store `embedding extensions.vector(1536)` as nullable so the schema can be deployed before backfill completes.
- Add an IVFFlat cosine index required by the project specification. Order related matches directly by `embedding <=> query_embedding`; never sort by a calculated similarity alias.
- Extend pending selection to include either a missing `article_analyses` row or an existing row whose embedding is null. Return an explicit `needs_analysis` flag and existing summary so pipeline behavior does not rely on `analyzed_at`.
- New rows save validated analysis and embedding atomically, then set `articles.analyzed_at`. Existing rows receive only a first-write-wins embedding backfill and keep their saved analysis. Never overwrite an existing analysis or embedding during concurrent runs.
- Keep separate database RPCs for the two safe mutations: `save_article_analysis` requires analysis plus embedding for a new row; `save_article_embedding` only fills a null embedding on an existing row. Both lock the article/analysis path and return the saved row.
- Existing analyzed rows may remain visible while the backfill runs, but Related Articles stays hidden until the current article has an embedding.
- Add a `match_related_articles` RPC because `supabase-js` cannot express pgvector operators through PostgREST. It excludes the current article, requires non-null embeddings and analyzed articles, joins source and card fields in SQL, orders by cosine distance, and caps output at five.
- `getRelatedArticles(articleId, embedding)` remains a server-only service-role query. Embeddings are never serialized into the presentation view or browser props.
- Do not add a similarity threshold without product evidence; return the closest available analyzed articles, up to five, as requested.
- Extend run summaries/logs with embedding counts while retaining existing analysis counters and safe error categories.

## Files likely to change
- `supabase/schema.sql`
- `supabase/verify.sql`
- A focused Dashboard upgrade SQL file under `supabase/` containing extension/ALTER/index/function/grant changes for the existing project
- `lib/supabase/types.ts`
- `lib/supabase/validation.ts`
- `lib/supabase/queries/analyses.ts`
- `lib/supabase/queries/articles.ts`
- `lib/ai/analyze-article.ts` or a small server-only embedding module under `lib/ai/`
- `lib/pipeline/analyze.ts`
- `lib/news/presentation.ts`
- `app/news/[id]/page.tsx`
- `components/news-details/article-details.tsx`
- `components/news-details/details.module.css`
- `tests/analysis.test.ts`
- `tests/supabase.test.ts`
- `scripts/verify-supabase.ts`
- `PROJECT_MEMORY.md` after successful implementation and verification

## Database implementation requirements
1. Enable `vector` in the `extensions` schema without version pinning.
2. Add nullable `article_analyses.embedding extensions.vector(1536)` and an IVFFlat `vector_cosine_ops` index scoped to non-null embeddings when supported by the live pgvector version.
3. Update the canonical initial schema and create a reviewable upgrade SQL script for the existing database. Use explicit compatibility checks so an incompatible prior object fails instead of being silently hidden.
4. Update `get_pending_articles` to return valid article fields plus `needs_analysis` and the stored summary. Select rows when analysis is absent or embedding is null; preserve cursor, selected-ID, bounds, and ordering behavior.
5. Update `save_article_analysis` so a new analysis cannot be marked complete without a valid 1536-dimensional embedding. Preserve first-valid-result-wins concurrency semantics.
6. Add `save_article_embedding` for idempotent embedding-only backfill. It must not update summary, scores, labels, evidence, disclaimer, or model.
7. Add `match_related_articles` as a stable, security-invoker RPC with a fixed empty search path, validated limit, current-article exclusion, analyzed/non-null filters, joined display fields, cosine ordering, and deterministic tie-break.
8. Revoke function execution from `PUBLIC`, `anon`, and `authenticated`; grant only the minimum required execution/table privileges to `service_role`. Preserve RLS with no public policies.
9. Notify PostgREST to reload its schema after SQL changes.

## Analysis and embedding requirements
1. Validate article input exactly as today before any provider call.
2. For missing analyses: generate and validate analysis, generate a 1536-value embedding from title plus validated neutral summary, validate every embedding value as finite, then save both atomically.
3. For existing analysis rows with null embedding: skip text generation, generate from title plus stored summary, and fill only the embedding.
4. Use the installed AI SDK `embed` API and `openai.embedding('text-embedding-3-small')`, `maxRetries: 0`, and a bounded timeout consistent with the current explicit provider retry policy.
5. Treat provider authentication/quota failures as fatal for the run and timeouts/request failures as safe categorized article failures. Never persist provider bodies, credentials, raw embeddings, or article text in logs.
6. Continue batching/cursor advancement so one nonfatal embedding failure does not strand later articles. Failed rows remain eligible on a later run.
7. Keep selected article IDs and request limits working for analysis and embedding-only rows.
8. Log per-batch and final counts for analysis generated, embeddings saved, embedding-only backfills, skipped, and failed.

## Related Articles UI requirements
1. Load the protected article first, then query related articles on the server only when its embedding exists.
2. Render a `Related Articles` section after the article body with up to five linked cards showing image, title, source, and publication date. Use stored data only.
3. Reuse established details-page tokens and responsive patterns: two columns on wide content areas, one column on narrow screens, 12px card radius, clear focus styles, readable metadata, and consistent image ratios.
4. Do not render an empty heading or placeholder when the current article lacks an embedding or no matches exist.
5. Exclude the current article and never show raw distance, raw embedding values, unanalyzed articles, or inaccessible/private fields.
6. Preserve Clerk protection, metadata lookup behavior, safe image handling, and the safe original-article link.

## Security requirements
- All OpenAI and Supabase service-role operations stay in `server-only` modules.
- Never expose `OPENAI_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, embeddings, raw article text, database errors, or provider response bodies to browser code or logs.
- UI must only read stored results; it must not generate embeddings or mutate pipeline state.
- Keep current RLS/no-anon-access posture. Do not add public grants or policies to resolve RPC access.
- Validate UUIDs, limits, embedding length, and finite values at the application boundary. Database vector dimensions provide a second validation layer.
- Related links must use internal UUID routes and existing safe image behavior.

## Acceptance criteria
1. The live Supabase project has the vector extension enabled, a nullable 1536-dimensional embedding column, the cosine IVFFlat index, and the three updated/new RPCs with service-role-only execution.
2. `supabase/schema.sql`, the upgrade SQL, and `lib/supabase/types.ts` agree with the live schema.
3. A new pending article is marked analyzed only after valid analysis and embedding are saved.
4. An existing analysis with null embedding is selected, embedded, and updated without another analysis generation or alteration of saved analysis fields.
5. Existing non-null embeddings and analyses are never overwritten by a retry or concurrent run.
6. Invalid vector length/nonfinite values and provider failures do not save partial state; safe logs and summary counts identify the category.
7. Related lookup returns at most five closest analyzed articles, excludes the current article, and uses cosine distance ordering.
8. The details page shows responsive linked related cards only when results exist; no embedding or distance reaches the browser.
9. Existing homepage, analysis route authorization, article protection, summaries, framing UI, and no-anon-table-access behavior remain intact.

## Checks to run
- Targeted unit tests: `npm run test:analysis` and `npm run test:data`.
- `npm run typecheck`.
- `npm run lint`.
- `npm run build` because server queries, route dependencies, schema types, and page rendering change.
- Apply the reviewed upgrade SQL to the configured Supabase project through the Dashboard SQL Editor (or an authenticated equivalent if available), then run a read/write verification query and database advisors.
- Run `npm run verify:supabase` after the live schema is updated.
- Run a limited authenticated `POST /api/analyze` to verify one new or backfill candidate, then inspect the saved embedding dimension without printing the vector.
- Verify a related-article RPC call excludes the source article and returns at most five rows in cosine order.
- Report exact outputs and any live verification step that cannot be executed from the available environment.

## Exact manual test steps after implementation
1. In Supabase Dashboard → SQL Editor, review and run the delivered `supabase/pgvector-related-articles.sql` against the configured project if it could not be applied automatically. Confirm the transaction succeeds, then run the included verification block.
2. In the project root, run `npm run typecheck`, `npm run lint`, `npm run test:analysis`, `npm run test:data`, and `npm run build`.
3. Start `npm run dev` and watch its terminal for analysis and embedding progress.
4. Trigger a bounded run:
   `curl.exe -X POST "http://localhost:3000/api/analyze" -H "Content-Type: application/json" -H "x-biasly-admin-secret: <BIASLY_ADMIN_SECRET>" --data-raw "{\"limit\":1}"`
5. Confirm the response reports an embedding saved (and whether it was a new analysis or backfill). In Supabase SQL Editor, verify only dimension/presence, never print vector values:
   `select article_id, vector_dims(embedding) as dimensions from public.article_analyses where embedding is not null order by created_at desc limit 1;`
6. Re-run the same selected article ID. Confirm no new provider work occurs and stored analysis/embedding remains unchanged.
7. Open that analyzed article at `http://localhost:3000/news/<article-id>` and sign in through Clerk if prompted. Confirm up to five Related Articles appear after the body, exclude the current article, and open their internal detail routes.
8. Check the page at 1440px, 768px, 390px, and 320px widths. Confirm two-column related cards become one column without overflow and keyboard focus is visible.
9. Test an analyzed article whose embedding is still null before backfill; confirm no empty Related Articles section renders.
10. Use the anon key against `article_analyses` and related RPC and confirm access remains denied; run database advisors and review any new security/performance finding.
