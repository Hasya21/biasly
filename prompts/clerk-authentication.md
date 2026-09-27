# Clerk authentication

## Goal

Implement Clerk authentication for biasly: working sign-in, sign-up, session persistence, account management, and sign-out integrated into the existing shared news header.

## Skills read and documentation

- `.agents/skills/clerk/SKILL.md`: explicitly requested Clerk router; no Clerk dependency exists, so use current SDK patterns.
- Follow the project's approved skill list. Use official Clerk setup documentation directly for implementation details.
- Clerk Next.js quickstart: https://clerk.com/docs/nextjs/getting-started/quickstart
- Clerk auth page guide: https://clerk.com/docs/nextjs/guides/development/custom-sign-in-or-up-page
- Installed Next.js guides: `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`, `05-server-and-client-components.md`, and `03-layouts-and-pages.md`.
- Recheck relevant installed SDK types and documentation during implementation; do not assume obsolete Clerk APIs.

## Existing code inspected

- `AGENTS.md`, `package.json`, `next.config.ts`, `.gitignore`, and `README.md`.
- `app/layout.tsx`, `app/page.tsx`, `app/news/[id]/page.tsx`, and `app/globals.css`.
- `components/homepage/header.tsx` and header styles in `components/homepage/homepage.module.css`.
- Next.js 16.3.4, React 19.2.8, TypeScript, Tailwind 4, npm lockfile, and shadcn conventions are present.
- The shared client header has disabled Login and Subscribe controls. Pages currently display approved sample content.
- No existing auth routes, Clerk provider, proxy, or tracked `.env.example` were found.
- The working tree contains existing edits and untracked app files. Preserve all existing work.

## Decisions and assumptions

- Keep `/`, and `/design-system` public. Authentication alone does not imply a news paywall or new private product features. The home news feed must remain fully accessible to anonymous users. `/news/[id]` is an authenticated feature. When a signed-out user attempts to access detailed analysis, redirect them to /sign-in and preserve the intended destination so they can return to the analysis after authentication.
- Use Clerk prebuilt components instead of custom password/session handling.
- Provide `/sign-in` and `/sign-up` as optional catch-all routes for multi-step flows.
- Use `/` as the fallback after sign-in/sign-up and destination after sign-out. Preserve Clerk-supported return destinations.
- Use the existing Clerk application if already configured. Do not overwrite existing credentials or print secret values. If configuration is absent, document the required setup and identify any runtime verification blocked by it.
- No user database sync, organizations, billing, saved stories, Supabase changes, or pipeline work is included.

## Files likely to change

- `package.json`, `package-lock.json`
- `proxy.ts`
- `app/layout.tsx`
- `app/sign-in/[[...sign-in]]/page.tsx`
- `app/sign-up/[[...sign-up]]/page.tsx`
- A small shared auth layout/style module if useful
- `components/homepage/header.tsx`, `components/homepage/homepage.module.css`
- A focused account controls component if useful
- `.env.example`, `.gitignore`, `README.md`
- `app/globals.css` only if needed for supported Clerk styling

## Implementation requirements

1. Add a current compatible `@clerk/nextjs` dependency using npm and update the lockfile. Integrate changes deliberately into the existing app.
2. Add `clerkMiddleware()` from `@clerk/nextjs/server` in root `proxy.ts` with the documented matcher excluding framework assets and static files. Keep public routes accessible; do not apply blanket `auth.protect()`.
3. Add `ClerkProvider` within the root body while preserving the font, metadata, root classes, and Server Component boundaries.
4. Add prebuilt `SignIn` and `SignUp` pages with correctly configured paths and cross-links. Support verification and recovery steps through Clerk.
5. Replace the disabled Login control with working signed-out Login and Sign up controls. For signed-in users show `UserButton` with account management and sign-out. Use current SDK-supported conditional rendering and a stable loading state.
6. Keep Subscribe visibly unavailable. Remove or relocate the existing shared Coming soon annotation so it does not describe working authentication.
7. Configure public auth route environment variables and fallback redirect URLs. Add a tracked `.env.example` with placeholders for the canonical AGENTS.md environment variables, and allow only that example through `.gitignore`. Never add `CRON_SECRET` to `.env.local`.
8. Update README to explain Clerk configuration, public routes, local startup, production environment setup, and manual auth verification. Correct the statement that Login is unavailable.
9. Avoid changing sample article rendering, article data, filtering, theme behavior, or unrelated application code.

## Visual interpretation

- Reuse biasly branding, Poppins, existing neutral colors, borders, and focus styles.
- Auth pages use a compact centered Clerk card, a home link/brand above it, generous vertical breathing room, and 16–24px mobile outer padding. Keep the card within the viewport.
- Header account controls retain the current compact button scale and align with the navigation. Adapt spacing at mobile widths without hiding all auth access.
- Preserve existing homepage and details layouts as closely as possible; only the account-control area should visibly change.
- Match established typography, spacing, and colors precisely where app-owned. Clerk's supported component styling governs internal form layout; no new pixel reference was supplied.
- Verify at 375, 768, 1024, and 1440px, in supported themes, and at 200% zoom. Ensure keyboard focus, accessible labels, and no horizontal overflow.

## Security requirements

- Keep `CLERK_SECRET_KEY` server-only and out of source control, logs, screenshots, responses, and client props.
- Do not inspect or print environment file contents containing secrets. Validate configuration without exposing values.
- Use Clerk-managed sessions and redirects; do not implement tokens in localStorage or custom credential endpoints.
- A signed-in Clerk user does not gain pipeline/admin privileges. Preserve the project's separate admin and cron secret rules.
- Do not create fake sessions, bypass auth to make tests pass, or provision unrelated services.
- Preserve ignored local environment configuration and all unrelated working-tree changes.

## Acceptance criteria

- Anonymous users can browse existing public pages and access sign-in/sign-up from the shared header.
- Anonymous users who attempt to access detailed news analysis are redirected to sign-in. After successful authentication, they are returned to the requested analysis.
- Signed-in users can access detailed news analysis normally.
- Signing out removes access to detailed analysis while leaving the homepage and public news feed accessible.
- Users can register and sign in using methods enabled for the configured Clerk application.
- Successful authentication shows the account button; refresh and navigation preserve session state.
- Account management opens and sign-out restores anonymous controls.
- Multi-step authentication routes load correctly and auth-page cross-links work.
- Existing themes, feed interactions, detail pages, and not-found behavior remain functional.
- No secrets enter committed files or client bundles.
- Typecheck, lint, and production build pass, or exact failures and configuration blockers are reported truthfully.

## Checks to run

From the project root, run `npm run typecheck`, `npm run lint`, and `npm run build`. Report actual command output. If freshly introduced routes require generated route types, run the installed Next.js type generation command before retrying typecheck.

Perform browser smoke checks where configuration and tools allow. Do not claim registration, sign-in, or session verification without completing those flows. User-controlled verification codes may require user participation.

## Exact manual test steps after implementation

1. Configure a Clerk development application and put its publishable and secret keys in ignored `.env.local`. Set `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/`, and `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/`. Never paste the secret into chat.
2. Run `npm run dev` from the project root and open `http://localhost:3000` in a private browser window.
3. While signed out, browse `/`, and `/design-system`; confirm no sign-in wall. Confirm `/news/does-not-exist` still shows its not-found state.
4. Click Login. Verify `/sign-in` loads. Follow Sign up, register with a test email, and complete any verification required by Clerk.
5. Confirm the signed-in account button appears. Refresh, navigate to `/news/peace`, and open account management.
6. Sign out through the account menu. Confirm the homepage and signed-out controls appear. Sign in again with the same test account.
7. Open `/sign-in` and `/sign-up` directly; verify cross-links and configured signed-in behavior without redirect loops. Exercise password recovery if enabled for this application.
8. Repeat header/auth checks at 375, 768, 1024, and 1440px, using keyboard navigation and 200% zoom. Recheck homepage themes and filtering.
9. Inspect the browser console and Next.js terminal for auth, hydration, and routing errors, without sharing secrets.
10. Run `npm run typecheck`, `npm run lint`, and `npm run build`. With valid build/runtime configuration, run `npm run start` and repeat the public-page and auth smoke checks.
