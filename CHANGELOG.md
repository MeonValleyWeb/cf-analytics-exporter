# Changelog

Versions use MAJOR.MINOR.PATCH; initial milestones use 0.0.x.

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
