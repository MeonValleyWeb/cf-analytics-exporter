# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(0.x — the API may change between minor versions).

## [Unreleased]

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
