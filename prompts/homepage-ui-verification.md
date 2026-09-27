# Homepage verification — September 15, 2026

Implemented the approved `prompts/homepage-ui.md` with labeled sample stories.

## Final check output

Windows PowerShell blocks `npm.ps1` under its execution policy, so checks used the equivalent `npm.cmd` executable.

### `npm.cmd run typecheck` — exit 0

```text
> skewed_news@0.1.0 typecheck
> tsc --noEmit
```

### `npm.cmd run lint` — exit 0

```text
> skewed_news@0.1.0 lint
> eslint
```

### `npm.cmd run build` — exit 0

```text
> skewed_news@0.1.0 build
> next build

▲ Next.js 16.3.4 (Turbopack)
⚠ Warning: Next.js ignored package-lock.json in C:\Users\Dell because it is outside the current Git repository (C:\Users\Dell\Desktop\Projects\skewed_news).
 To use this directory, set `turbopack.root` in your Next.js config.

✓ Running next.config.ts took 85ms

  Creating an optimized production build ...
✓ Compiled successfully in 3.6s
  Running TypeScript ...
  Finished TypeScript in 6.7s ...
  Collecting page data using 6 workers ...
  Generating static pages using 6 workers (0/5) ...
  Generating static pages using 6 workers (1/5)
  Generating static pages using 6 workers (2/5)
  Generating static pages using 6 workers (3/5)
✓ Generating static pages using 6 workers (5/5) in 2.4s
  Finalizing page optimization ...

Route (app)
┌ ○ /
├ ○ /_not-found
└ ○ /design-system

○  (Static)  prerendered as static content
```

The warning concerns an existing lockfile outside the repository. No Next.js config change was needed.

## Runtime and asset checks

- Production server smoke check on port 3105: `/` HTTP 200, twelve `<article>` elements, visible Sample edition label, `/design-system` HTTP 200.
- Rechecked the final production build: both routes, all twelve individual photo URLs, and `/_next/image?url=%2Fimages%2Fhomepage%2Fpeace.jpg&w=640&q=75` returned HTTP 200. The preview server is available at `http://localhost:3105`.
- All twelve local JPEG files successfully decoded with their expected dimensions. Portrait imagery was visually inspected and positioned for wide cards.
- Exact photographs differ from the reference; all are illustrative replacements with sources recorded in `public/images/homepage/CREDITS.md`.
- Browser visual and interactive checks could not run: the computer-use tool reported `No browser is available`. Responsive rendering, theme switching, keyboard interactions, browser console, and 200% zoom still need manual browser verification. No pixel-perfect claim is made.

## Manual verification

1. Run `npm.cmd run dev` and open `http://localhost:3000` (use the URL printed by Next.js if that port is occupied).
2. Compare the homepage at widths 1024, 1440, 768, and 375; check three/two/one-column layout and 200% zoom.
3. Select Health & Medicine; clear it, then select IPL to see the empty state. Clear filters to restore twelve cards. Scroll the topic strip.
4. Switch Light/Dark/Auto, refresh to check persistence, and change the OS theme while Auto is selected.
5. Use Tab/Enter/Escape on the menu, and Enter/Space on the card info disclosures. Check visible focus and readable percentage labels.
6. Open `/design-system`, verify its original preview, and check browser console output for errors.
