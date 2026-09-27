# Connect the news UI to Supabase

## Goal and authorization
Replace sample content on `/` and `/news/[id]` with stored analyzed articles. User authorized execution with “Execute the next change” after the proposed homepage/details/auth/empty-state integration. Save this scope before implementation and proceed under that authorization.

## Skills and inspected code
Read Supabase and Clerk skills, Clerk Next.js patterns, PROJECT_MEMORY.md, AGENTS.md, installed Next.js fetching-data and connection guides; consult current Clerk auth and Supabase join documentation. Inspected both pages, proxy.ts, Supabase article queries/types, homepage Feed/StoryCard/Header/Footer, details/sidebar components, sample-details, next.config.ts and package.json.

## Decisions
- One eligible stored article means one homepage card. No sample fallback, inferred topics/categories/regions, fabricated authors, source-count statistics or sample related articles.
- Eligibility requires an analysis row and non-null analyzed_at. Source active status governs ingestion, not visibility of existing published articles.
- Use server-only service-role reads, unchanged RLS/grants and schema. No pipeline mutations or new APIs.
- Bounded homepage pagination (20 per page plus one lookahead) keeps all records reachable. Page 1 is `/`; later pages use `?page=N`.
- Preserve public homepage and design-system preview. Replace static Clerk allowlist with page-level authorization for every real database article. A minimal public identity lookup checks existence without reading article bodies/analysis; unknown/malformed IDs remain 404 for everyone. Protect before reading full details.
- Use generic errors/retry UI distinct from an empty database. Never disclose raw database errors or credentials.
- Support stored HTTP(S) images using unoptimized Next Image (browser fetch, no broad server image proxy). Reject invalid schemes, handle broken images with a fallback. Dummy fixture model `manual-demo-fixture` remains explicitly labeled as demo; its disclaimer is shown verbatim.

## Files likely to change
app/page.tsx, app/news/[id]/page.tsx, proxy.ts, minimal error boundaries, lib/supabase/queries/articles.ts and types.ts, a small news presentation/loading module, homepage and details components/styles, README.md, PROJECT_MEMORY.md and focused tests. No database schema changes.

## Visual interpretation
Retain existing typography, colors, card geometry, theme controls, responsive grid, sidebar panels, header/footer and spacing. Replace sample-only metadata with actual publisher/date. Remove unsupported topic controls rather than inventing data. Empty/error states use existing panel styling; pagination is a small accessible navigation row. Details display stored text, summary, percentages, confidence, sentiment, framing notes, loaded terms, disclaimer and model; About this article remains single-publisher. Preserve keyboard focus, safe original links, wrapping at 375/768/1024/1440px and 200% zoom.

## Security and implementation
Server reads only; explicit typed DTO mapping; render article text as text, never HTML. Keep raw text and full analysis out of public cards and metadata. Public metadata can use only the minimal title/existence projection. Never trust route IDs without UUID validation. Auth must precede full detail retrieval; use request-scoped memoization only. Keep original HTTP(S) links safe, without embedded credentials. No changes to keys or auth providers. Stored dates use deterministic formatting. Refresh must read current database state rather than a build-time snapshot.

## Acceptance criteria
One published row renders exactly one card; zero renders a true empty state. Pending rows stay hidden. Cards link to database UUIDs. Signed-out readers redirect to Clerk for existing articles and return after sign-in; missing/malformed/unpublished records are 404. Full saved analysis appears only after authentication. Sample content never appears on production news pages. Failures are not disguised as empty feeds. Additional pages remain accessible.

## Checks and manual steps
Run npm.cmd run typecheck, lint, build, test:data and read-only verify:supabase; report actual output. Add focused tests for mapping, missing fields/unsafe URLs, query eligibility and minimal identity projections as appropriate.
Run npm.cmd run dev; visit `/` and compare eligible DB count (for the current single-record fixture, one card). Click its title signed out, sign in, confirm the full stored article/disclaimer. Reload after database changes. Test `/news/not-a-uuid` and a nonexistent UUID for 404; verify no sample-related stories/topics. On a separate test database verify zero records, pending records and database error states; do not mutate real data for tests. Check themes, mobile widths, keyboard navigation and pagination. Keep design-system samples working.
