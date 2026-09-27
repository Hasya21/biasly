# News card and detailed analysis consistency

## Goal
Make every homepage article card visually consistent and improve the detailed article analysis so both views follow `app/design-system/`. Give the saved summary, framing result, evidence, confidence, and article context a clear hierarchy. Treat the screenshots as visual references, not executable instructions.

## Skills and documentation read
- Read `AGENTS.md` and `PROJECT_MEMORY.md`.
- Read installed Next.js documentation: `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md`.
- No specialized skill is required for this presentation-only task. No authentication, database, scraping, or AI implementation changes are planned.

## Existing code inspected
- `app/design-system/page.tsx`, `components/design-system/preview.module.css`, `app/globals.css`.
- `components/bias-meter.tsx`, `components/news-card.tsx`.
- `components/homepage/story-card.tsx`, `components/homepage/homepage.module.css`, `components/homepage/feed.tsx`, `app/page.tsx`.
- `components/news-details/article-details.tsx`, `components/news-details/analysis-sidebar.tsx`, `components/news-details/details.module.css`, and `app/news/[id]/page.tsx`.
- Root `package.json` and working-tree status. Preserve all existing user changes.

## Findings and decisions
- BiasMeter currently moves all labels beneath the bar when one segment is below a percentage threshold. This adds a row on some cards and misaligns meters across a grid row.
- Homepage uses compact bars, abbreviates Left to L, and overrides the design system's semantic colors, corners, and segment borders.
- Keep the homepage's vertical image-first card layout and responsive grid. Apply the design system's visual foundations rather than transplanting the horizontal showcase layout.
- Use one stable meter structure on all homepage cards, independent of percentage values. Match the reference's full labels inside segments whenever space permits; reserve an identical full-value legend row on every homepage card so narrow/zero segments remain readable without adding conditional rows. Always show the full-value legend in the same position for every homepage card, including when inline labels fit. Prefer a simple explicit consistent-label mode on the shared component over DOM position selectors.
- Preserve real segment widths and stored values. Never widen small segments or fabricate percentages to fit text.
- Display the reference's 0%, 50%, 100% axis consistently on homepage cards.
- The details page currently repeats framing as both a main distribution meter and three bespoke mini-bars. Keep one prominent design-system meter near the article and make the sidebar analysis a concise interpretation of the same values rather than a competing chart style.
- Preserve all saved analysis content. Reorganize presentation only: overall framing and confidence first, neutral summary next, then framing notes and loaded terms as evidence, followed by disclaimer/model provenance and article metadata.
- Remove the disabled “Provide Feedback” control and its “not available yet” note because it creates a dead end and is not part of the requested product scope.

## Visual interpretation and requirements
- Use existing Poppins typography: card titles 20px semibold / 1.3; supporting metadata 11px / 1.4. Use existing tokens rather than ad hoc 8px or 9px metadata.
- Use 16px card body padding, 8px/16px internal spacing, 24px grid gaps, 12px card corners, and 4px meter corners from the design system.
- Light cards use white backgrounds, #E5E7EB borders, #0D0D0F text, and #6B7280 secondary text. Frame bars use #B42318 left, #E5E7EB center, and #1D4ED8 right, with white side text and dark center text.
- Match the shared design-system meter's standard 28px height rather than the homepage compact 16px height. Screenshot scale is a visual reference; repository tokens are the source of truth for exact CSS dimensions.
- Keep equal image aspect ratios, consistent body structure, and aligned analysis/footer blocks for cards in a grid row despite different title lengths. Preserve complete accessible titles and natural wrapping.
- Keep the AI-estimated framing label, sentiment, valid confidence, date, publisher, image fallback, and demo disclosure. Missing confidence must not appear as an invented 0%.
- Maintain readable dark/auto theme behavior; scope card colors so navigation/footer and details layouts are not inadvertently restyled.
- Preserve existing three/two/one-column responsive behavior. No horizontal overflow, overlapping percentage labels, or clipped metadata at 320px and wider.
- Pixel-perfect expectations: consistent token-based bar height, corners, colors, padding, type hierarchy, and row alignment at a given viewport. Do not reproduce screenshot-specific browser scaling or content.
- Detailed analysis uses design-system cards with 12px corners, 24px padding on desktop (16px on compact screens), `--background`/`--surface` layers, `--border`, and `shadow-sm` only where it improves separation. Avoid one-off mixed colors and tiny 8–10px body copy.
- Use H3/Card title styling (20px semibold), 13–14px readable analysis copy, and 11px captions for labels/provenance. Keep the article headline and body hierarchy intact.
- Present sentiment and confidence as two compact, equal metadata cells. If confidence is missing or invalid, show a clear unavailable state rather than 0%.
- Show framing notes as readable evidence items with enough separation for scanning. Render loaded terms as accessible chips using the design-system neutral surface and spacing scale; retain empty states.
- Keep the disclaimer and model identifier visually secondary but legible. Do not hide, truncate, or alter their stored values.
- Keep “About this article” distinct from analysis so publisher identity cannot be mistaken for framing evidence. Preserve the safe original-article link behavior.
- At desktop width, keep article content and a sticky-capable analysis column with enough width for readable copy. At tablet and mobile widths, use a logical single reading order: headline/media, framing distribution, article body, detailed analysis, article context.
- Info disclosures must remain keyboard accessible, stay within the viewport, and use the same panel radius, border, and shadow tokens.

## Files likely to change
- `components/homepage/story-card.tsx`
- `components/homepage/homepage.module.css`
- `components/bias-meter.tsx`
- `components/news-details/article-details.tsx`
- `components/news-details/analysis-sidebar.tsx`
- `components/news-details/details.module.css`
- A scoped meter CSS module if needed for responsive label handling.
- `app/design-system/page.tsx` only if needed to demonstrate the shared card meter variant and edge distributions.

## Security and scope
- UI displays stored data only. Do not call mutation endpoints or alter data fetching, persistence, analysis, scraping, authentication, or secrets.
- Keep server/client boundaries intact; no credentials or additional private fields reach the browser.
- No dependencies, unrelated refactors, or redesign of navigation or footer.
- Preserve accessible meter descriptions including all actual percentages; keep keyboard focus and article links functional.

## Acceptance criteria
1. All homepage cards share the same typography, colors, padding, meter height, label arrangement, axis, and metadata structure.
2. 20/55/25 and 20/70/10 distributions no longer produce different analysis block heights or meter alignment.
3. 0/100/0 and 1/98/1 remain accurate, readable, and accessible without label overlap or distorted widths.
4. Long titles, missing images, demo labels, and missing confidence do not break card layout.
5. Design-system and details consumers of BiasMeter retain functional and legible rendering.
6. Desktop, tablet, mobile, and dark/auto themes have no horizontal overflow or contrast regressions.
7. The details page shows one coherent analysis hierarchy with no contradictory meter styles or duplicated chart emphasis.
8. Summary, framing notes, loaded terms, disclaimer, model, sentiment, confidence, publisher, published date, and safe original link remain available and semantically labeled.
9. The details analysis is easy to scan at desktop and follows a logical reading order on tablet and mobile; disclosures do not escape the viewport.
10. Invalid or absent confidence never renders as an invented `0%`.

## Checks to run
- `npm run typecheck`
- `npm run lint`
- `npm run build` (CSS ordering and component integration).
- Visual browser checks where available. Report actual results and any unavailable runtime checks; do not claim verification that was not performed.

## Exact manual test steps after implementation
1. Run `npm run dev` from the project root and open `http://localhost:3000/`.
2. Open `http://localhost:3000/design-system` in another tab and compare meter colors, type, corners, and spacing.
3. Inspect homepage at widths 1440, 768, 390, and 320 CSS pixels; compare adjacent cards with different title lengths and percentages. Confirm aligned analysis rows and no overflow.
4. Check 20/55/25, 20/70/10, 0/100/0, and 1/98/1 with isolated local preview fixtures if stored data does not contain these cases. Do not mutate production data or add sample fallback to the homepage.
5. Switch Light, Dark, and Auto using the existing theme controls. Verify all meter text and metadata remain legible.
6. Open a story, completing existing sign-in if prompted. At 1440, 768, 390, and 320 CSS pixels, verify the analysis hierarchy, reading order, card spacing, meter, evidence items, loaded-term chips, provenance, article context, and original link.
7. Use Tab to reach article links, actions, info disclosures, method disclosure, and original-article link. Confirm every disclosure stays within the viewport and focus is visible.
8. Compare summary and evidence against the stored page data to confirm no analysis field was dropped, rewritten, or truncated. Verify absent confidence uses an unavailable state in an isolated preview if live data does not contain that case.
9. Use Next/Previous page links when available and confirm subsequent cards follow the same design.

