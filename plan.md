# Product Roadmap Plan

## Current State Snapshot
- Astro 5 SSR app with Netlify functions for Cloudflare GraphQL analytics.
- Single-zone credentials stored in browser localStorage; no user accounts or backend storage.
- Exports only CSV; charts are traffic/status/cache/security with limited geo on free plans.

## Assumptions & Open Questions
- Cloudflare API access is governed by the customer’s Cloudflare plan; confirm which datasets are gated (e.g., longer retention, geo, WAF).
- Decide whether to support Account-level auth (OAuth or API token) and how to store/rotate tokens.
- Identify legal/compliance requirements for storing analytics, tokens, and user data.

## Phase 1: SaaS Foundations (Auth + Multi-Tenant)
- ✅ Add user authentication (Clerk sign-in/up).
- ✅ Store tokens securely server-side (Supabase) instead of localStorage.
- ✅ Add account-level access with domain dropdown (API token + zones).
- ⏳ Introduce role-based access (owner, admin, viewer).
- ⏳ Create a minimal settings area for zones, users, and integrations.

## Phase 2: Data Pipeline & Export Expansion
- Support export formats: CSV (existing), JSON, and scheduled exports.
- Add report generation jobs for weekly/monthly PDFs (traffic, cache, security, top countries).
- Create an email summary system with opt-in schedules per zone.
- Add flexible time ranges with plan-aware limits and clear UX gating.

## Phase 3: Monetization & Pricing Pages
- Build pricing/plan pages with feature matrix and usage limits.
- Integrate billing (e.g., Stripe) and enforce plan entitlements in APIs.
- Add upgrade prompts in UI, especially when users hit data limits.
- Track conversions with referral/affiliate IDs for Cloudflare upgrades.

## Phase 4: Analytics UX Improvements
- Rework dashboards to outperform Cloudflare’s UX: richer filters, comparisons, and export controls.
- Add download center with history, status, and re-download links.
- Provide multiple visualization modes (time series, cohorts, geo maps).

## Phase 5: AI Insights & Guidance
- Train/implement analytics summarization (traffic shifts, anomaly detection, cache hit rate insights).
- Provide weekly “what changed” briefs and actionable guidance.
- Add explainable recommendations tied to user goals (performance, security, cost).

## Technical Enablers
- Introduce a backend datastore (Postgres) for users, zones, exports, and reports.
- Add a job runner/queue (Netlify scheduled functions or a background worker).
- Implement caching/rate-limit handling for Cloudflare API requests.
- Add audit logging for token usage and report generation.

## Success Metrics
- Activation: % of signups connecting a zone.
- Engagement: exports per week, email summary open rate.
- Revenue: conversion rate to paid plan; affiliate upgrade revenue.
