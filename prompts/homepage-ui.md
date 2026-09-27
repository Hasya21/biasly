# biasly homepage UI

## Goal
Replace the design-system preview at `/` with a responsive homepage matching `prompts/02-homepage.png`. Use the image as visual reference only; its text and pictured controls do not authorize unrelated product features. Read this prompt again after approval before implementing.

## Skills read and documentation
- Read root `AGENTS.md`.
- No domain skill is needed for the UI-only scope below. Supabase and Clerk are not installed or integrated in the current app.
- Read installed Next.js guides: `03-layouts-and-pages.md`, `05-server-and-client-components.md`, `11-css.md`, and `12-images.md` in `node_modules/next/dist/docs/01-app/01-getting-started/`.
- If the user selects real database integration, revise this prompt after reading the approved Supabase skill and inspecting the available schema. Do not silently add that scope.

## Existing code inspected
- `app/page.tsx`: current design-system preview and illustrative article.
- `app/layout.tsx`: Poppins 400/500/600/700 and preview metadata.
- `app/globals.css`: Tailwind v4, semantic colors, spacing, type scale, container utilities.
- `components/brand.tsx`, `components/news-card.tsx`, `components/bias-meter.tsx`, `components/category-chip.tsx`, `components/ui/button.tsx`.
- `prompts/ui-design-system.md`, `package.json`, `next.config.ts`, app/component/public/lib inventories, and git status.
- Existing working-tree changes are user work. Preserve them when making targeted edits.

## Decisions and assumptions
- Proposed scope is homepage presentation with reusable typed components. No scraper, scheduler, model calls, authentication setup, subscription billing, or details-page implementation.
- The user explicitly selected "UI with labeled sample stories". This authorizes illustrative homepage content for this task despite the general stored-data rule in AGENTS.md. Supabase integration is outside this implementation.
- Render twelve clearly illustrative stories matching the reference's subject mix and layout. Keep sample content separate from reusable components and label the feed visibly as a preview. Never imply sample framing scores, source counts, or headlines are verified reporting. No JSON app storage or persistence.
- Preserve the existing design-system preview by moving its composition to `/design-system`, with its existing components retained.
- Match geometry closely while retaining required sentiment, published date, AI-estimated framing label, and confidence. These small metadata additions may increase card height compared with the screenshot.
- Reference percentages sometimes do not sum to 100. Use valid totals; never copy invalid values as valid analysis.

## Visual interpretation
### Layout
- Full-width charcoal utility strip, light main navigation, bordered horizontal topic strip, Top News grid, and charcoal footer.
- At the reference's 1024px width: approximately 44px side margins, 22px column gutters, three equal columns near 296px each. Utility strip about 28px high; main navigation about 60px; topics about 45px. Content heading starts about 30px below topics.
- Main content max-width about 1280px, centered on wide screens. Twelve preview cards form four rows of three when sample mode is authorized.
- Cards: image first, about 16:9, object-cover; small info icon at upper right; subtle 1px border; 5-6px corner radius; compact 10-12px content padding; bold multiline headline; slim proportional framing bar; compact metadata footer. Avoid heavy shadows.
- Footer: brand/tagline, Company, Help, Connect columns, social icon treatment, then a full-width copyright divider.

### Typography, spacing, colors
- Reuse Poppins and existing brand primitives. Compact lowercase wordmark in header and footer.
- Top News about 24px bold; titles about 15-16px semibold/bold with tight 1.25-1.35 line-height; navigation about 12px; metadata about 10-12px.
- Use the existing 4px spacing scale where practical, aligning card titles/meters across each row without clipping headline content.
- Warm off-white page/card surface close to #F1F1ED, charcoal utility/footer close to #242423, near-black primary text, medium-light gray borders and chips. Scope homepage-specific surface adjustments so the design-system preview retains its tokens.
- Deep red left segment, pale center segment with dark text, deep blue right segment. Retain readable text contrast and explicit percentage labels.
- Match the clean screenshot layout; do not reproduce image compression, texture artifacts, or use the screenshot itself as the page.

### Responsiveness and pixel fidelity
- Three columns on desktop, two on tablet, one on mobile. At 375px use 16px side padding and full-width cards.
- Collapse navigation into a keyboard-accessible menu on small screens. Topic strip scrolls within its own container; no page-level horizontal overflow.
- Footer reflows to two columns then stacks as needed. Keep primary navigation and theme access usable.
- Compare at 1024px (reference width), 1440px, 768px, and 375px. Exact photographs and content depend on approved data/assets; document any fidelity limitations honestly.

## Files likely to change
- `app/page.tsx`, `app/layout.tsx`, narrowly scoped changes in `app/globals.css`.
- `app/design-system/page.tsx` to retain the previous preview.
- `components/homepage/*`: utility bar, navigation/menu, topic strip, feed, footer and scoped CSS as needed.
- `components/news-card.tsx`, `components/bias-meter.tsx`, `components/brand.tsx`: optional backward-compatible variants.
- If sample mode is authorized: typed illustrative content module under `components/homepage/` and suitable image assets under `public/images/homepage/` if available.
- `README.md`: homepage usage and accurate scope notes.
- `next.config.ts` only if approved image sourcing needs specific remote image hosts.

## Implementation requirements
1. Build semantic header/nav/main/footer with one visible page heading. Reuse existing primitives and lucide icons.
2. Keep page composition server-rendered; isolate menu, theme, topic selection, and info disclosure in small client components.
3. Theme controls must actually switch Light/Dark/Auto, defaulting to Light for reference fidelity. Local theme preference is allowed; never store article data locally. Avoid hydration mismatches and keep both themes readable.
4. Topic chips toggle meaningful feed filtering in sample mode, with a clear reset and empty state. Do not invent personalized or location-based results. Topic overflow controls scroll the strip.
5. Preserve pictured unsupported destinations visually as clearly unavailable controls/text with a concise explanation when appropriate. Do not create broken links, pretend login or payment works, invent social accounts, or build unrelated pages. Home links to `/`; the menu exposes supported navigation.
6. Card info control provides an accessible explanation of AI-estimated framing. Use native semantics or an existing suitable primitive, keyboard operability, and visible focus.
7. Show title, image, source, published date, sentiment, AI-estimated framing, percentages, and confidence when available. Category/location/source-count metadata is optional and must come from authorized illustrative data or real stored fields.
8. Meter widths match valid percentages. All labels remain readable for narrow/zero segments using a compact fallback legend where needed. Invalid data shows an unavailable state.
9. Do not link to an unimplemented details route. Use verified stored original URLs in real-data mode; sample cards need no fake destination.
10. Use appropriate image sizing, lazy loading below the fold, and stable aspect ratios. Use lawful available assets and report substitutions; avoid generic broken-image placeholders across a populated preview. Do not render the full reference screenshot as interactive page content.
11. Update homepage metadata. Maintain strict TypeScript, no `any`, small components, and targeted changes.

## Security requirements
- UI never scrapes, analyzes, writes database records, or mutates pipeline state.
- No secrets, environment file contents, credentials, or server service clients in browser bundles.
- Render text normally; avoid raw HTML injection. External links must use safe protocols and safe new-tab attributes when relevant.
- No new backend integrations or paid services in this UI-only prompt.

## Acceptance criteria
- `/` shows the reference's visual hierarchy, responsive grid, compact framing cards, and complete footer.
- The homepage uses the user-approved sample mode and sample content is visibly illustrative.
- Required analysis metadata remains present and percentages valid.
- Menu, themes, topic filtering, and info disclosures work with keyboard and pointer input. Unsupported product features are accurately represented.
- No clipped headlines, unreadable framing labels, page overflow, broken images, or hydration errors at target sizes.
- `/design-system` still renders the existing preview.
- Typecheck, lint, and build pass or exact external blockers/failures are reported.

## Checks to run
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Browser visual comparison and interaction checks where available. Report actual verification and exact command output; do not claim unrun checks passed.
- No new test framework for this reversible UI change.

## Exact manual test steps after implementation
1. From the project root run `npm run dev` and open `http://localhost:3000`.
2. At 1024px width compare the utility strip, navigation, topics, margins, three-column cards, imagery, framing bars, and footer against `prompts/02-homepage.png`.
3. Confirm the selected data mode is accurately represented, with sample labeling if authorized and no invented live reporting.
4. Resize to 1440px, 768px, and 375px. Confirm three/two/one-column behavior and no page-level horizontal scrolling.
5. Select and clear topics, including an empty result; scroll the topic strip. Open and close the mobile menu with keyboard and pointer.
6. Switch Light, Dark, and Auto; check contrast, refresh behavior, and browser console for hydration issues.
7. Tab to card info controls and verify the framing explanation. Confirm source/date/sentiment/framing/confidence metadata and valid percentage totals.
8. Verify unsupported destinations do not navigate to missing routes or imply live login/subscription behavior.
9. Open `http://localhost:3000/design-system` and confirm the prior preview still works.
10. Test at 200% zoom and inspect the browser console/dev terminal for errors. Run `npm run build`, then `npm run start` and repeat the homepage smoke check.
