# MEMORY - cf-analytics-exporter

**Project:** Cloudflare Analytics Exporter  
**Type:** SaaS Analytics Tool  
**Status:** Phase 1B (Plan-Aware UX)

## Core Purpose
Export Cloudflare analytics data with better UX than Cloudflare's native dashboard. Multi-tenant SaaS.

## Key Features
- Multi-zone support with dropdown selection
- Plan-aware feature gating (free vs pro)
- Server-side token storage (secure)
- CSV export (JSON/PDF planned)
- Traffic, status, cache, security charts

## Architecture
- **Frontend:** Astro 5 SSR
- **Auth:** Clerk (PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY)
- **Database:** Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
- **API:** Cloudflare GraphQL analytics
- **Host:** Netlify with Node.js compatibility

## Key Files
- `plan.md` - Full product roadmap
- `AGENTS.md` - Contributor guidelines
- `CLAUDE.md` - Claude Code guidance
- `src/pages/` - Routes
- Netlify functions for Cloudflare API calls

## Environment Variables
```
PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

## Roadmap Phases
1. SaaS Foundations ✓ (mostly)
1B. Plan-Aware UX (current)
2. Data Pipeline & Export Expansion
3. Monetization & Stripe
4. Analytics UX Improvements
5. AI Insights & Guidance
