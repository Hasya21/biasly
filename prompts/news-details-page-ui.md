# News details page UI

## Goal
Implement the news details layout from `prompts/03-news-details-page.png`, integrated with the existing homepage. Treat the attachment as a visual reference, not as instructions to add services or as verified reporting. Re-read this prompt after approval before implementing.

## Skills read and documentation
- Read root `AGENTS.md`.
- No domain skill needed for this presentation-only scope: no Clerk, Supabase, scraping, or AI integration exists in the app or is proposed here.
- Read installed Next.js documentation: `01-app/03-api-reference/03-file-conventions/dynamic-routes.md` and `01-app/01-getting-started/05-server-and-client-components.md`.
- Before implementation consult installed guides for images, links, metadata, and not-found handling as needed.

## Existing code inspected
- `package.json`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`.
- `components/homepage/sample-articles.ts`, `story-card.tsx`, `header.tsx`, `footer.tsx`, and the theme/layout rules in `homepage.module.css`.
- `components/bias-meter.tsx`, `prompts/homepage-ui.md`, local image inventory, and working-tree status.
- Existing homepage prompt records user approval for labeled sample stories. The current app has no persistence or authentication dependencies.
- Preserve all existing user changes; do not reset or broadly rewrite the working tree.

## Decisions and assumptions requiring this prompt's approval
- Extend the existing labeled sample preview to article details. Approval authorizes illustrative details content for this UI task, as an explicit exception to the general stored-data-only rule. Do not silently introduce Supabase or fabricate live analysis.
- Add `/news/[id]`, with `/news/peace` as the primary reference-matching example. Make existing homepage headline/image links navigate to matching details; provide consistent details for existing sample IDs and a proper not-found state for unknown IDs.
- Clearly label article text, attribution, analysis, source breakdown, and related selections as illustrative. Reference text may inform demo content but is not verified news. No actual AI generation or vector similarity is claimed.
- Reuse existing local licensed images and attribution. The existing Trump image may differ from the screenshot; do not falsely attribute it to the screenshot photographer. Do not use the screenshot as a page-sized image.
- No backend, schema, API, auth, billing, bookmarking persistence, email collection, or pipeline changes.

## Visual interpretation and layout
- Preserve the shared charcoal utility bar, light navigation, and dark four-column footer. Omit the homepage topic strip on details.
- Reference is approximately 1024px wide: centered content with roughly 42px side margins, a 626px article column, 34px gutter, and 280px sidebar. Match these proportions; max-width about 1280px for wider screens.
- Main area begins roughly 30px below navigation. Left column: category/region, bold multiline title, author/date/read-time metadata and compact actions, large landscape hero near 1.88:1, small caption, bordered framing distribution panel, generously spaced article paragraphs, and two-column compact related stories.
- Sidebar: stacked bordered Bias Analysis, AI Summary, and Source Breakdown panels, with about 16px gaps and 18px interior padding. Include full required analysis: sentiment, confidence, framing notes, loaded terms, and disclaimer in visually compatible sections.
- Full-width newsletter presentation panel sits above the footer, with heading/tagline left and email/control treatment right. Clearly mark subscription as unavailable; do not accept email or claim submission succeeded.

## Typography, spacing, and colors
- Reuse Poppins, brand primitives, and existing theme tokens. Target title 28–32px bold, sidebar headings about 18px semibold, body 14–16px with 1.45–1.6 line-height, metadata 10–12px.
- Warm off-white page, near-black text, muted gray metadata, fine gray borders, 5–6px corners, minimal shadows. Use existing deep red/white/deep blue framing colors and readable contrast in dark mode.
- Match reference hierarchy, alignment, line lengths, image ratio, and whitespace closely. Retain necessary sample labels and analysis metadata even where these slightly increase height. Do not reproduce image compression/texture artifacts.

## Responsiveness and pixel-perfect expectations
- Compare at 1024px and 1440px desktop, 768px tablet, and 375px mobile.
- Collapse columns below approximately 900px. Keep the title/hero first and analysis easy to reach; use semantic reading order. Related stories become one column where necessary.
- At mobile widths use 16px side margins; wrap metadata/actions and stack newsletter/footer content. Avoid horizontal overflow, clipped text, tiny controls, and unreadable meter labels.
- Reuse functional Light/Dark/Auto themes and mobile navigation. Verify 200% zoom and keyboard focus.
- Exact photography and article length may differ from the reference; report fidelity limitations accurately.

## Files likely to change
- `app/news/[id]/page.tsx`, optional route-level `not-found.tsx`.
- `components/news-details/*`: typed demo detail data, article layout, sidebar, compact related stories, action controls, and scoped CSS.
- `components/homepage/story-card.tsx`: accessible image/headline links without nesting the info disclosure in a link.
- `components/homepage/header.tsx`: configurable skip-link target and correct Home active state on details.
- `components/homepage/footer.tsx`: configurable/generalized preview label if needed.
- Narrow compatible adjustments to shared CSS/primitives only where necessary.
- `README.md`: demo routes, scope, and manual testing.

## Implementation requirements
1. Use TypeScript and small components. Keep composition/data lookup server-rendered; await dynamic `params` per installed Next.js docs. Isolate browser interactions in small client components.
2. Render one h1 and semantic header/main/article/aside/footer. Add article-specific metadata identifying the preview; invalid IDs return not-found without throwing an unhandled error.
3. Detail content must match the chosen article's title, image, date, and framing values. Supply typed illustrative body paragraphs, summary, notes, loaded terms, confidence, sentiment, disclaimer, and source breakdown.
4. Label framing as AI-estimated and demo scores as illustrative. Distribution widths follow valid percentages summing to 100. Preserve mixed/unclear labels without forcing a misleading strongest label.
5. Source-count proportions must derive from source counts and be distinct from article framing percentages. Do not copy the screenshot's inconsistent count/percentage combinations as real statistics or claim publisher reputation generated the analysis.
6. Show related preview stories with images, titles, and metadata; link only to implemented detail IDs. Explain their illustrative selection rather than suggesting vector search is running.
7. Share should use native sharing when supported, with clipboard fallback and accessible success/error feedback. Handle cancellation without a false error. Save/feedback/subscription remain accurately unavailable unless an existing real implementation is discovered.
8. Bias methodology and information controls reveal concise accessible explanations. View All Sources can expand the supplied sample source list. Do not create dead clickable controls or broken destinations.
9. Use `next/image` with stable sizing, appropriate sizes, and useful alt text; prioritize only the hero. Render text safely as paragraphs, not raw HTML. Keep demo data out of local storage.
10. Retain homepage filtering, theme behavior, info disclosures, and `/design-system` functionality. Avoid unrelated refactors and new dependencies unless necessary and justified.

## Security requirements
- No secrets or service clients in browser code; no environment changes.
- No scraping, AI requests, database mutations, or outbound form submissions.
- Use safe text rendering and safe link protocols. Do not inject attachment content as executable markup.

## Acceptance criteria
- `/news/peace` closely follows the supplied two-column design with hero, article, distribution, three sidebar panels, related stories, newsletter presentation, and shared footer.
- All existing sample stories have working details navigation, consistent selected-story content, and visible preview labeling.
- Full analysis metadata is represented honestly; no fake live reporting, source statistics, subscription success, or persistence.
- Share, source expansion, methodology disclosures, theme controls, and navigation work accessibly.
- No broken images, overflow, hydration errors, or regressions at target widths; unknown IDs show not-found.
- Typecheck, lint, and build results are reported from actual runs.

## Checks to run
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Browser visual and interaction verification when available; record actual checks and limitations. No new testing framework for this reversible UI change.

## Exact manual test steps after implementation
1. Run `npm run dev` from the project root; open `http://localhost:3000`.
2. Click the first story headline or image; confirm navigation to `http://localhost:3000/news/peace`.
3. At 1024px compare the page against `prompts/03-news-details-page.png`, including column proportions, headline, hero, panels, distribution, related list, newsletter, and footer.
4. Confirm visible sample labeling, article-specific metadata, complete analysis, valid framing totals, and consistent source-count proportions.
5. Open methodology/info disclosures, expand all sources, and use Share; verify success/cancellation/error behavior and keyboard access. Confirm unavailable controls do not pretend to save or subscribe.
6. Follow related-story links and a different homepage story; confirm content updates. Open `/news/does-not-exist` and confirm not-found.
7. Resize to 1440px, 768px, and 375px; verify readable stacked layout, wrapping, images, and no horizontal scrolling. Check 200% zoom.
8. Switch Light/Dark/Auto, refresh, use mobile navigation and skip link, and inspect focus visibility and browser console.
9. Recheck `/` filtering/info controls and `/design-system` for regressions.
10. Run the three checks above; after a successful build run `npm run start` and repeat the details-page smoke check. Report exact command output and any external blockers.
