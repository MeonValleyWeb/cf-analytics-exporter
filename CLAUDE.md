# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cloudflare Analytics Exporter - an Astro-based web application configured for server-side rendering on Cloudflare Workers.

## Commands

```bash
npm run dev       # Start dev server at localhost:4321
npm run build     # Build production site to ./dist/
npm run preview   # Preview production build locally
```

## Architecture

- **Framework**: Astro 7.3 with SSR mode (`output: 'server'`)
- **Deployment**: Cloudflare Workers (via `@astrojs/cloudflare`)
- **Module System**: ES modules (`"type": "module"`)

### Key Files

- `astro.config.mjs` - Astro configuration with Workers adapter
- `src/pages/` - File-based routing (`.astro` or `.md` files become routes)
- `public/` - Static assets served at root path

Follow `AGENTS.md` for versioning and commits; see `docs/workers-migration.md` for deployment.
