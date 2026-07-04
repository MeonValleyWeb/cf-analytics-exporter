# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(0.x — the API may change between minor versions).

## [Unreleased]

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
