# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cloudflare Analytics Exporter - an Astro app (SSR) that lets signed-in users store a
Cloudflare API token and view/export zone analytics fetched from Cloudflare's GraphQL API.

## Commands

```bash
npm run dev           # Start dev server at localhost:4321 (runs in workerd via wrangler.jsonc)
npm run build         # Build production site to ./dist/
npm run preview       # Preview production build locally
npm run lint          # ESLint
npm run format:check  # Prettier check (format with npm run format)
npm run check         # astro check (typechecking)
```

CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, and build on every push/PR.

## Architecture

- **Framework**: Astro 7.x with SSR mode (`output: 'server'`)
- **Deployment**: Cloudflare Workers (via `@astrojs/cloudflare` adapter; `wrangler.jsonc` sets `nodejs_compat`)
- **Auth**: Clerk (`@clerk/astro` v3) — `clerkMiddleware()` in `src/middleware.ts`; API routes derive the user from `locals.auth()` and must never trust client-supplied user ids
- **Database**: Supabase (service role key, server-side only); Cloudflare tokens are AES-256-GCM encrypted at rest (`TOKEN_ENCRYPTION_KEY`)
- **Module System**: ES modules (`"type": "module"`)

### Key Files

- `astro.config.mjs` - Astro configuration with Cloudflare adapter + Clerk integration
- `src/middleware.ts` - Clerk middleware (auth for every request)
- `src/pages/api/` - JSON API routes (all require a signed-in user)
- `src/lib/server/env.js` - runtime env access (`cloudflare:workers` env with `.env` fallback in dev); never read `locals.runtime.env` (removed in Astro 6)
- `src/lib/server/token-crypto.js` - token encryption at rest
- `CHANGELOG.md` - versioned 0.x.0; add an entry and bump `package.json` for each meaningful change
