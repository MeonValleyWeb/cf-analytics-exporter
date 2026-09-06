# Changelog

Versions use MAJOR.MINOR.PATCH; initial milestones use 0.0.x.

## 0.0.2 — 2026-09-06

### Added
- Account-scoped billing API with independent Billing Read token and account allowlist.
- Coverage/subscription discovery and current-billing-period ingestion using Cloudflare's V1 cost API.
- Normalized billing rows and decimal-string summaries separated by service, currency and billing period; cumulative costs are never summed with period costs.
- Explicit no-data/unknown-cost states and daily-source freshness metadata without implying real-time spend caps.
- Local ingestion CLI saving private snapshots outside Git, billing setup guide and cost-control roadmap.
- Billing regression tests and a release-metadata consistency test.

### Changed
- Shared scope authentication and HTTP transport between traffic and billing; upstream redirects are rejected.
- Synchronized package and lockfile version to 0.0.2.

### Validation
- 52 automated tests, the production build and local Worker billing route checks passed. The live CLI exited pending configuration without upstream requests; account billing/invoice reconciliation remains unverified.
- This milestone provides on-demand ingestion and local snapshots. Scheduled storage, budgets, D1 Guard and deployment remain later milestones.

## 0.0.1 — 2026-09-06

### Added
- Authenticated JSON/CSV analytics exports, zone allowlists, validation, bounded upstream retries/timeouts and safe errors.
- Dataset capabilities, retention-aware query windows and explicit missing-day metadata.
- Live verification command with independent dashboard baseline support.
- Development roadmap, setup documentation and 41 automated tests.
- Project agreement requiring commits, changelog entries and synchronized versions for completed milestones.

### Changed
- Upgraded Astro to 7.3.1 and migrated the Netlify prototype to Cloudflare Workers.
- Preserved daily request/bandwidth semantics and legacy URL redirects.

### Validation
- 41 tests and the production build passed again before the baseline commit. Local Worker route checks passed during the milestones.
- Real analytics permissions/schema/fidelity remain unverified because no credentials are configured. No deployment performed.
