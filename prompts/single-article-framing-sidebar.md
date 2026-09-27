# Single-article framing sidebar

## Goal
Reshape the Source Breakdown panel for an article with exactly one publisher. Present article-level framing without implying multiple sources or assigning political leanings to a publisher.

## Skills read and code inspected
- Supabase skill and supporting Postgres skill consulted for the companion memory/fixture task; this UI follow-up requires no database changes.
- `AGENTS.md`, `PROJECT_MEMORY.md`, `components/news-details/analysis-sidebar.tsx`, `app/news/[id]/page.tsx`, and `lib/supabase/server.ts`.
- Before writing UI code, read the installed Next.js server/client component guide and inspect `components/news-details/details.module.css`, `sample-details.ts`, `article-details.tsx`, and existing framing components.

## Decisions and assumptions
- One article has one publisher. Left/center/right percentages describe its text, never source counts.
- This checkout currently uses sample details. Preserve honest preview labels and do not add live-data wiring under this UI task. If the checkout gains live-data wiring before execution, adapt its existing DTO without replacing it with sample data.
- Keep the existing Bias Analysis panel as the primary percentages/sentiment/confidence display; avoid repeating that chart in the replacement panel.
- Replace Source Breakdown with “About this article”: publisher identity, original article link when a genuine URL exists, publication date, and a short explanation that framing estimates apply to this article only. Retain framing evidence and loaded terms in their existing analysis section.
- No synthesized publisher lists, source-count percentages, publisher leaning badges, or “View all sources” control. Do not invent links for existing sample fixtures.

## Files likely to change
- `components/news-details/analysis-sidebar.tsx`
- `components/news-details/details.module.css`
- `components/news-details/sample-details.ts` only if a minimal presentation field is needed
- `README.md` for updated UI verification instructions

## Visual interpretation
Reuse the current sidebar card width, panel border, radius, surface color and heading style. Use the existing typography tokens, muted metadata, and spacing rhythm. Publisher identity and the original-article link are the focal point; supporting explanatory text is secondary. Preserve light/dark theme contrast. Match the surrounding design rather than inventing a new visual system; pixel-perfect expectations apply to the existing card alignment and spacing, not the obsolete multi-source content. On narrow screens, retain the current stacked article/sidebar flow. Long publisher names and URLs must wrap without overflow.

## Implementation and security requirements
- Render only available article/publisher information from the current presentation model.
- Keep “AI-estimated” language and preserve sample disclaimers where data is illustrative.
- Do not infer publisher ideology from an article's framing label.
- Original-article links must be safe HTTP(S) URLs; use safe external-link attributes when opening a new tab.
- No browser Supabase access, scraping, model calls, schema changes or authentication changes.
- Preserve keyboard-accessible disclosures, meaningful link labels, and readable focus states.

## Acceptance criteria
- A single article shows one publisher without source-count comparisons.
- Existing article percentages, summary, sentiment, confidence, evidence and disclaimer remain available.
- No duplicate framing chart is added; publisher identity is not assigned a political label.
- Missing original URL yields a sensible non-link state; long names do not overflow.
- Existing details navigation and Clerk protection continue to work.

## Checks and manual testing
1. Run `npm.cmd run typecheck` and `npm.cmd run lint`; run `npm.cmd run build` if server components/routes or imports change. Report actual output.
2. Run `npm.cmd run dev`, sign in and open `/news/peace` (or an existing live article route if integration has since landed).
3. Verify one publisher, article-specific framing language, no count distribution and no fabricated external link.
4. Check 375px, 768px, 1024px and 1440px widths, light/dark themes, 200% zoom, keyboard focus and disclosure controls.
5. Verify the unknown-article not-found route and signed-out protection remain intact.

## Approval
Prepared as a follow-up UI task. Await user approval before changing the sidebar implementation, per AGENTS.md section 2.
