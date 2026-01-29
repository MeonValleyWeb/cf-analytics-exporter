# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cloudflare Analytics Exporter - an Astro-based web application configured for server-side rendering on Netlify.

## Commands

```bash
npm run dev       # Start dev server at localhost:4321
npm run build     # Build production site to ./dist/
npm run preview   # Preview production build locally
```

## Architecture

- **Framework**: Astro 5.x with SSR mode (`output: 'server'`)
- **Deployment**: Netlify (via `@astrojs/netlify` adapter)
- **Module System**: ES modules (`"type": "module"`)

### Key Files

- `astro.config.mjs` - Astro configuration with Netlify adapter
- `src/pages/` - File-based routing (`.astro` or `.md` files become routes)
- `public/` - Static assets served at root path
