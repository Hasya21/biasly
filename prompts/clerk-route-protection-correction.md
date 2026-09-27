# Clerk route-protection correction

## Goal

Correct two mismatches in the Clerk authentication feature:

1. Keep authentication enforcement in Clerk middleware.
2. Let the dynamic article page remain solely responsible for validating whether an article ID exists and showing its not-found state.

## Skills and documentation read

- `.agents/skills/clerk/SKILL.md` for current Clerk Next.js routing guidance.
- `node_modules/next/dist/docs/01-app/02-guides/authentication.md` for the distinction between Proxy checks and resource-level protection.
- `components/homepage/sample-articles.ts` for the current valid article IDs.

## Existing code inspected

- `proxy.ts`
- `app/news/[id]/page.tsx`
- `app/layout.tsx`
- `README.md`
- `prompts/clerk-authentication.md`

## Decisions and assumptions

- `/`, `/design-system`, `/sign-in`, and `/sign-up` remain public.
- Valid sample article details remain available only to authenticated users.
- Middleware cannot query the dynamic page or Supabase to determine whether an arbitrary article ID exists. For the current sample-only implementation, it will match the twelve known article URLs explicitly.
- The dynamic page remains unchanged as the only component that validates an ID and renders `notFound()`.
- When Supabase-backed dynamic articles replace samples, the middleware matcher must be replaced by a route-level authorization design or a deployment-generated allowlist; manually maintained static IDs would otherwise fail open for newly added articles.
- Preserve Clerk's existing return-to-original-page behavior after sign-in.

## Files likely to change

- `proxy.ts`
- `README.md`
- `prompts/clerk-authentication-verification.md`

## Implementation requirements

1. Retain Clerk middleware as the authentication boundary.
2. Replace the broad `/news(.*)` route matcher with exact matches for the twelve current sample article routes: `peace`, `grapes`, `cern`, `nicaragua`, `lebanon`, `oil`, `space`, `apple`, `climate`, `fed`, `soccer`, and `fire`.
3. Keep `auth.protect()` inside middleware for those exact routes. Do not import Clerk server auth APIs into `app/news/[id]/page.tsx`.
4. Leave `app/news/[id]/page.tsx` responsible for validating article existence and calling `notFound()` for all non-sample IDs.
5. Update README wording so it accurately states that middleware verifies access to known sample article details, while the dynamic details page handles existence and unknown IDs render 404 for every reader.
6. Update verification documentation to reflect the corrected implementation, including the static sample-route allowlist limitation.

## Security requirements

- Keep session enforcement in server-side middleware. Do not rely on header UI state for access control.
- Do not expose Clerk secrets, add custom session handling, or weaken authentication on valid articles.
- Keep all unrelated routes and working-tree changes untouched.

## Acceptance criteria

- `/news/peace` as an anonymous document request redirects to `/sign-in` and retains `/news/peace` as the return destination.
- `/news/does-not-exist` returns the existing 404 page without a sign-in redirect, regardless of auth state.
- `app/news/[id]/page.tsx` contains no auth enforcement and remains responsible only for article lookup and 404 rendering.
- Existing public pages remain public.
- `npm run typecheck`, `npm run lint`, and `npm run build` pass.

## Checks to run

Run `npm run typecheck`, `npm run lint`, and `npm run build` from the project root. Start the production app locally and use anonymous HTTP checks for `/`, `/design-system`, each protected sample URL, and an unknown `/news/[id]`. Confirm protected responses do not include article text before authentication.

## Manual test steps

1. Configure Clerk credentials in ignored `.env.local` and run `npm run dev`.
2. In a private browser window, visit `/news/peace`; confirm redirect to `/sign-in`, sign in, and confirm return to `/news/peace`.
3. In the same signed-out window, visit `/news/does-not-exist`; confirm the story-not-found page instead of an auth redirect.
4. Repeat the unknown-ID check while signed in.
5. Confirm `/`, `/design-system`, `/sign-in`, and `/sign-up` remain accessible without signing in.
6. Run the required typecheck, lint, and build commands.
