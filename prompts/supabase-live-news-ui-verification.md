# Live Supabase UI verification

Implemented under the user's “Execute the next change” authorization. Homepage and details now use stored published articles; the live project contained exactly one published article during verification. No database rows, policies, schema, secrets, or pipeline state were changed.

## Final command results

`npm.cmd run typecheck` — exit 0:
```text
> skewed_news@0.1.0 typecheck
> tsc --noEmit
```

`npm.cmd run lint` — exit 0:
```text
> skewed_news@0.1.0 lint
> eslint
```

`npm.cmd run test:data` — exit 0:
```text
> skewed_news@0.1.0 test:data
> node --conditions=react-server --import tsx --test tests/supabase.test.ts

✔ input gates reject malformed articles and model output without rewriting meaningful URLs (13.4764ms)
✔ data access preserves chunk bounds, errors, RPC atomicity, claims, and cursor selection (210.6079ms)
✔ stored news mapping preserves saved analysis and excludes private content from cards (71.9798ms)
ℹ tests 3
ℹ suites 0
ℹ pass 3
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1904.7818
```

`npm.cmd run verify:supabase` — exit 0 with network access; initial restricted-network attempt could not connect:
```text
> skewed_news@0.1.0 verify:supabase
> node --env-file=.env.local --conditions=react-server --import tsx scripts/verify-supabase.ts

Read-only verification: vycsiolxgxgdtbmbmbkn.supabase.co
PASS: active sources (2), published articles (1), pending page (0), logs, schedules, and anonymous read denial.
No rows written. Run supabase/verify.sql in SQL Editor for transactional write/permission checks.
```

`npm.cmd run build` — exit 0:
```text
> skewed_news@0.1.0 build
> next build

▲ Next.js 16.3.4 (Turbopack)
- Environments: .env.local
⚠ Warning: Next.js ignored package-lock.json in C:\Users\Dell because it is outside the current Git repository (C:\Users\Dell\Desktop\Projects\skewed_news).
 To use this directory, set `turbopack.root` in your Next.js config.

✓ Running next.config.ts took 82ms

  Creating an optimized production build ...
✓ Compiled successfully in 4.0s
  Running TypeScript ...
  Finished TypeScript in 5.7s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/5) ...
  Generating static pages using 7 workers (1/5)
  Generating static pages using 7 workers (2/5)
  Generating static pages using 7 workers (3/5)
✓ Generating static pages using 7 workers (5/5) in 1015ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ○ /design-system
├ ƒ /news/[id]
├ ƒ /sign-in/[[...sign-in]]
└ ƒ /sign-up/[[...sign-up]]

ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

## Production HTTP smoke check

Started `npm.cmd run start -- --port 3102` with network access, asserted the following, then stopped that temporary server:
```text
PASS: / returns 200 and exactly 1 stored article card.
PASS: stored UUID redirects 307 to local /sign-in without full analysis.
PASS: /news/not-a-uuid returns 404.
PASS: /news/00000000-0000-0000-0000-000000000000 returns 404.
PASS: /?page=2 shows an empty page without sample cards.
PASS: /design-system remains HTTP 200.
```

An additional in-memory test bundled the real loader with mocked auth/database boundaries and rendered the empty feed:
```text
PASS: malformed/missing IDs never read full details; signed-out access stops at auth; signed-in details load after auth; empty feed has no sample fallback.
```

The initial browser-like HTTP probe entered Clerk's development handshake. The final plain HTTP probe confirmed local `/sign-in`; middleware explicitly configures the existing local sign-in/sign-up paths. Signed-in browser interaction, return-after-login, image fallback visuals, themes and responsive layout still require manual browser checks. The signed-in loader ordering was verified with mocks, not by creating a real Clerk session. No real database was emptied or populated for testing.

## Manual follow-up

Run `npm.cmd run dev`; open `http://localhost:3000` and confirm one card. Click its title signed out, sign in, and compare the article body and complete analysis with Supabase. Test 375/768/1024/1440px, 200% zoom, themes, Share and disclosures. The actual UUID comes from the homepage card, not an old sample slug. The dummy SQL fixture's local image URL assumes port 3000. See README for empty/pending/error and pagination checks against an isolated test project.
