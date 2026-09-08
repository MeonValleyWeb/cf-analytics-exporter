# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(0.x — the API may change between minor versions).

## [Unreleased]

### Added

- Added the written implementation plan for the read-only Crawler Guard `0.7.0`
  milestone, including architecture, risk-engine, API, UI, testing, release, and
  commit boundaries.
- Added a pure crawler-risk engine, bounded `robots.txt` inspector, paginated
  Cloudflare zone/account adapter, and authenticated read-only Crawler Guard API.
- Added Node test coverage for crawler directives and Content Signals, policy
  risk rules, Cloudflare API pagination and permission handling, and safe
  `robots.txt` retrieval.
- Added the authenticated `/crawler-guard` interface with account-grouped zone
  selection, Search/AI agent/AI training visibility cards, policy and managed
  robots status, evidence panels, and exact manual remediation guidance.

### Changed

- Ignored generated Supabase CLI `.temp` metadata so local project linking does
  not leave credentials or machine-specific state in the working tree.
- Extended `/api/cf-zones` with account metadata and full pagination while
  preserving the existing flat `zones` response.
- Updated token setup guidance to include the optional `Bot Management:Read`
  permission needed for complete Crawler Guard evidence.

## [0.6.0] - 2026-07-04

### Changed

- **Upgraded Astro 6.4 → 7.0.6** (Rust compiler, Vite 8/Rolldown), along with
  `@astrojs/cloudflare` 13 → 14 (which now requires `wrangler` as a peer
  dependency, added as a dev dependency) and `@astrojs/react` 4 → 6.
- Removed the deprecated `session: { driver: 'memory' }` config — the app
  does not use Astro sessions, and the string driver signature was already
  deprecated in Astro 6.
- Re-added the `legacy-peer-deps` npm setting: `@clerk/astro` 3.4.x has not
  yet added astro ^7 to its peer range. Verified working at runtime (its
  Astro-facing APIs are unchanged in v7); remove the setting once Clerk
  publishes ^7 peer support.
- Removed a `@ts-expect-error` on the Tailwind vite plugin — the Vite 8
  alignment fixed the type mismatch.

Verified on Astro 7: build, typecheck (0 errors), lint, and a dev smoke test
(all pages 200 with real content, all `/api/*` endpoints 401 when
unauthenticated, no errors or warnings in the dev server log).

## [0.5.0] - 2026-07-04

### Added

- **CI pipeline** (`.github/workflows/ci.yml`): ESLint, Prettier check,
  `astro check` typechecking, and a production build on every push and PR.
- ESLint flat config (`eslint.config.js`) with astro + typescript-eslint
  presets, Prettier with the Astro plugin, and `npm run lint / format /
format:check / check` scripts.
- `src/env.d.ts` typing for the `cloudflare:workers` env module.

### Fixed

- Typecheck errors surfaced by `astro check`: missing React type packages,
  the `selectedZone` state type missing `plan`, and an implicit-inline
  `<script>` hint in the layout.
- Completed the Clerk v3 component migration: `SignedIn`/`SignedOut` were
  removed in v3, replaced with `<Show when="signed-in|signed-out">`;
  `UserButton` no longer takes `afterSignOutUrl`.

## [0.4.0] - 2026-07-04

### Fixed

- **Production runtime env access was broken since the Astro 6 upgrade.**
  `locals.runtime.env` throws in `@astrojs/cloudflare` v13, so every request
  that read Supabase/Clerk credentials would have crashed on the Workers
  runtime. Env vars are now read via `import { env } from 'cloudflare:workers'`
  (with an `import.meta.env` fallback for `.env` in local dev) through a shared
  `getEnv()` helper in `src/lib/server/env.js`.

### Changed

- **Upgraded `@clerk/astro` from v2 to v3** (3.4.11). v2's middleware calls
  the removed `locals.runtime.env` API internally and cannot run on
  Astro 6 + Cloudflare at all. v3 declares Astro 6 peer support, so the
  `legacy-peer-deps` npm workaround is not needed.
- Added `wrangler.jsonc` with the `nodejs_compat` compatibility flag
  (Clerk's server SDK imports `node:async_hooks`); the dev server now runs in
  workerd with the same flags as production.
- Verified end-to-end in dev: pages render and all `/api/*` endpoints return
  401 for unauthenticated requests.

## [0.3.0] - 2026-07-04

### Security

- **Cloudflare API tokens are now encrypted at rest** with AES-256-GCM before
  being written to Supabase. Requires a new `TOKEN_ENCRYPTION_KEY` environment
  variable (32-byte base64, e.g. `openssl rand -base64 32`). Rows saved before
  this release are still read as plaintext and get encrypted the next time the
  user saves a token.
- **Removed the legacy browser-side credential flow.** API tokens can no
  longer be sent from the client to `/api/cf-export`; the server always uses
  the signed-in user's stored (encrypted) token. The dashboard also deletes
  any plaintext `cf_credentials` left in visitors' localStorage by older
  versions.

### Removed

- `src/components/CredentialForm.astro` (dead code — no page rendered it) and
  its only backend, `/api/validate-token`.

## [0.2.0] - 2026-07-04

### Security

- **Close GraphQL injection in `/api/cf-export`.** `zoneId` and `hostname`
  were interpolated into the Cloudflare GraphQL query string unvalidated,
  allowing a crafted value to rewrite the query. `zoneId` must now be a
  32-character hex string, `hostname` must be a valid domain name, and dates
  are validated before being re-serialized via `toISOString()`.
- `/api/validate-token` validates `zoneId` before interpolating it into the
  Cloudflare REST URL path.

### Changed

- Export date ranges are capped at 92 days (each day is a separate upstream
  query, so unbounded ranges could hammer the Cloudflare API).

## [0.1.0] - 2026-07-04

### Security

- **Enforce server-side authentication on all API routes.** Previously every
  `/api/*` endpoint trusted a client-supplied `userId`, letting anyone read any
  user's Cloudflare zones and analytics. Clerk's `clerkMiddleware()` is now
  wired into `src/middleware.ts` and every route derives the user from
  `locals.auth()`, returning `401` when unauthenticated. `userId` is no longer
  accepted from request bodies.
- Removed a live Cloudflare API token that was committed in `.env.example`
  (rotate it in the Cloudflare dashboard if not already done).

### Changed

- `/api/cf-zones` is now a `GET` endpoint (it no longer needs a request body).
- API routes share a `json()` response helper (`src/lib/server/http.js`).
- `.env.example` now documents the Clerk and Supabase variables the app
  actually uses.
