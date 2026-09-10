# Product Roadmap Plan

## Current State Snapshot

- Astro 7 SSR app deployed through the Cloudflare Workers adapter.
- Clerk authentication with encrypted Cloudflare API tokens stored in Supabase.
- Multi-account zone enumeration through the existing single-token user model.
- CSV analytics export and traffic/status/cache/security/geo dashboard views.
- Crawler Guard v0.7.0 provides read-only, per-zone crawler visibility and
  remediation assessments.
- Config Guard v0.8.0 provides on-demand, read-only Worker configuration drift
  checks from browser-local Wrangler files.

## Assumptions & Open Questions

- Cloudflare API access is governed by the customer’s Cloudflare plan; confirm which datasets are gated (e.g., longer retention, geo, WAF).
- Decide whether to support Account-level auth (OAuth or API token) and how to store/rotate tokens.
- Identify legal/compliance requirements for storing analytics, tokens, and user data.

## Phase 1: SaaS Foundations (Auth + Multi-Tenant)

- ✅ Add user authentication (Clerk sign-in/up).
- ✅ Store tokens securely server-side (Supabase) instead of localStorage.
- ✅ Add account-level access with domain dropdown (API token + zones).
- ✅ Create a minimal settings area for zones, users, and integrations.
- ⏳ Introduce role-based access (owner, admin, viewer).

## Phase 1B: Plan-Aware UX (Current Focus)

- ✅ Detect Cloudflare plan per zone and store in selection.
- ✅ Show upgrade banner and pro-only gating.
- ✅ Improve traffic charts with moving averages and dual-axis scaling.
- ✅ Add free-plan cache/security summaries to improve value.

## Milestone 0.7: Crawler Guard

- ✅ Enumerate all zones and derive accounts using the existing token/auth model.
- ✅ Read Bot Management configuration where permission and plan support allow.
- ✅ Fetch and parse the public apex-zone `robots.txt` within safety limits.
- ✅ Assess Search, AI search/agent, and AI training visibility.
- ✅ Detect managed robots and Content Signal conflicts.
- ✅ Flag the September 15, 2026 mixed-purpose crawler policy risk.
- ✅ Provide evidence and exact manual remediation without automatic mutation.
- ✅ Add credential-free risk-engine and adapter tests.
- ⏳ Run live acceptance scans across representative Cloudflare plan/settings
  combinations.

## Milestone 0.8: Config Guard

- ✅ Parse `wrangler.json`, `wrangler.jsonc`, and `wrangler.toml` locally in the
  browser.
- ✅ Resolve default and named Wrangler environments without inheriting binding,
  variable, or secret declarations incorrectly.
- ✅ Read deployed Worker settings and secret-name metadata with no Cloudflare
  mutations.
- ✅ Detect required/stale secrets, missing/unexpected/type-mismatched bindings,
  compatibility date/flags, and supported observability drift.
- ✅ Return deterministic `PASS`, `WARNING`, or `DRIFT` with exact evidence and
  manual remediation.
- ✅ Add the authenticated Config Guard interface, responsive product navigation,
  credential-free fixtures/tests, documentation, and semantic versioning.
- ⏳ Run authenticated live acceptance against representative Workers and token
  permission/error states.
- ⏳ Design a standalone GitHub Action/CLI contract after live API acceptance.

## Phase 2: Data Pipeline & Export Expansion

- Support export formats: CSV (existing), JSON, and scheduled exports.
- Add report generation jobs for weekly/monthly PDFs (traffic, cache, security, top countries).
- Create an email summary system with opt-in schedules per zone.
- Add flexible time ranges with plan-aware limits and clear UX gating.
- **White-label branded reports (paid tier):** customers upload a logo and set
  brand colours/company name, producing client-ready reports and a white-labelled
  dashboard view with our branding removed. Needs: asset storage (Supabase Storage)
  for logos, a per-user branding settings table, templated report rendering that
  applies the branding, and plan entitlement checks so only paying users can enable it.
  Consider shareable read-only report links as the delivery mechanism.

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
- Add a job runner/queue (Cloudflare Workflows, Queues, or a background Worker).
- Implement caching/rate-limit handling for Cloudflare API requests.
- Add audit logging for token usage and report generation.
- Add scheduled Crawler Guard scans, evidence history, and change notifications
  after the read-only on-demand model has live acceptance evidence.
- Add scheduled Config Guard scans, GitHub Action annotations, and drift history
  after the on-demand Worker comparison has live acceptance evidence.

## Success Metrics

- Activation: % of signups connecting a zone.
- Engagement: exports per week, email summary open rate.
- Revenue: conversion rate to paid plan; affiliate upgrade revenue.
