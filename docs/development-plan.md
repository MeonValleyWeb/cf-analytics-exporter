# Phased development plan

Updated 5 September 2026. Working assumption: a private Cloudflare traffic reporting tool for the owner's zones, initially using daily requests and bytes. Hosting remains Cloudflare Workers; Astro is the reporting frontend. This is not a visitor/conversion analytics product.

## Phase 1 — Reliable, private exports (implemented locally)

Deliver authenticated JSON/CSV exports; an explicit zone allowlist; strict UTC day, range and body validation; parameterized GraphQL; bounded retries/timeouts; sanitized errors; no-store responses; automated regression tests. Refactor the prototype into a Workers-compatible service while preserving the daily query and legacy URLs.

Acceptance: build succeeds; tests cover successful JSON/CSV, unauthorized access, invalid input, network/GraphQL errors and retry limits; built Worker rejects unauthorized requests before upstream access.

Status: 27 tests passed and production build passed. Local Worker HTTP verification is recorded in the accompanying implementation report. Not deployed. API clients now need a separate bearer secret. Requests containing timestamps must change to YYYY-MM-DD.

## Phase 2 — Verify datasets and export fidelity (code implemented; live acceptance pending)

1. Use an Analytics Read token scoped to the allowed zones, through local secrets or Worker bindings.
2. Query the Cloudflare settings node for `httpRequests1dGroups`: availability, available fields, history, maximum duration and page size.
3. Compare a completed UTC day and a seven-day window with the same zone/timezone/metric in Cloudflare's dashboard. Document any data delay, missing-day or sampling behavior; never assume absent days mean zero.
4. Expose authenticated capability metadata; split export requests into permitted windows and report unavailable history explicitly. Add fixtures based on redacted real responses.
5. If hostname/status/cache breakdowns are needed, evaluate the adaptive dataset separately and label its semantics rather than mixing it with daily totals.

Implemented locally: authenticated capabilities endpoint, settings-driven retention/field checks, up to 366 days split into at most 32 permitted windows, missing-day metadata, shared operation deadline and read-only verification CLI. 41 automated tests and the production build pass. The local `.dev.vars` file and required environment bindings are absent; the CLI exits with a pending status without contacting Cloudflare. Dashboard comparison and real-response fixtures remain outstanding.

Acceptance: one real zone matches the agreed baseline; supported metrics and limits are documented; no false-empty successes or silent truncation. Depends on actual token/zone access. Current local tests cannot establish this.

## Phase 3 — Historical collection and multi-zone reporting

Proposed architecture, to validate against volume: Worker scheduled handler -> shared analytics service -> D1 daily aggregates. Key each row by zone, dataset and UTC day. Store collected-at time and source metadata; separate run status from data. Keep credentials in Worker secrets, not the database.

- Migration-managed zone configuration, daily totals and collection-run tables.
- Idempotent upserts so retries never double-count; per-zone isolation and bounded batches.
- Daily scheduled collection with a small overlapping refresh window for late data.
- Bounded historical backfills within source retention; checkpoint and resume.
- Authenticated aggregate/download API; missing data and stale collection are explicit.
- Retention policy and indexes based on actual zone count/history needs.

Acceptance: repeating a run yields identical totals; a partial failure resumes without duplicates; history remains queryable after the source window expires; one failing zone does not discard other zones' results. Depends on phase 2's verified data contract and production resource configuration.

## Phase 4 — Reporting interface

Replace the starter page with a private Astro reporting interface: zone selector, complete-day range selector, request/bandwidth totals and trends, side-by-side zone comparison, CSV download, last successful collection and clear missing/stale/error states. Label UTC boundaries and infrastructure metrics precisely.

Use Cloudflare Access or another verified session-based mechanism for human users. Do not embed the machine exporter key in the client bundle, URLs or browser storage. Chart from stored aggregates so each UI interaction does not consume Cloudflare query quota.

Acceptance: browser checks cover filtering, empty/missing/stale states, download correctness, keyboard access and narrow screens; dashboard totals reconcile with exported data.

## Phase 5 — Production rollout and operations

Confirm the existing Worker/account/domain, provision required bindings, apply migrations, configure secrets and schedules, and deploy to a preview environment before promotion. Run authenticated real-data smoke tests. Monitor collection failures, stale data and rate limiting without logging tokens or raw upstream errors. Document rollback, secret rotation and recovery/backfill procedures.

Acceptance: preview and production routes work, scheduled collection is observed, private endpoints cannot be used anonymously, deployment is reproducible, and rollback/recovery is documented. Remote changes require the correct target configuration; the local default Worker name is not proof of production identity.

## Boundaries and decisions

- Phase 2 expands requests to at most 366 complete UTC days and 32 data windows. Fresh dataset settings constrain retention, fields, duration and page size. Each daily window requests enough rows for every day it can contain; no silent truncation or history clipping is accepted. Missing days remain explicitly missing.
- JSON keeps the prototype array shape; CSV has `date,requests,bytes` columns.
- Two upstream attempts maximum per query, each with a 10-second timeout and a shared 25-second abort deadline across the operation; short Retry-After delays only. No queue or persistent rate limiter yet.
- CodeGraph is unnecessary at the current repository size.
- Confirm whether multi-site reporting, historical retention, or both are the priority before choosing collection/UI depth.

References: [Cloudflare dataset settings](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/), [GraphQL limits](https://developers.cloudflare.com/analytics/graphql-api/limits/), [Astro Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/).

## Cost-control track — added 6 September 2026

The product now targets Cloudflare usage and cost visibility, followed by opt-in safeguards. Traffic verification remains pending; billing is an independent account-scoped source and does not require completing traffic verification to prototype.

- **0.0.2 — billing foundation:** on-demand current-period ingestion, coverage discovery, separate Billing Read credentials, normalized rows, accurate per-currency/period summaries, local private snapshots and tests. Implemented; real-account acceptance pending. See `billing.md`.
- **Next — persistent history:** store replaceable account/period snapshots alongside traffic history, preserving collection time and source scope. Handle overlapping snapshots without double-counting. Provision resources only against the verified target account. Billing snapshots and fine-grained D1 telemetry need separate models.
- **Then — budgets:** configurable thresholds, explicit daily-data lag, forecasts labeled as estimates, and notification delivery with user authorization. No claim that delayed billing totals can enforce a real-time cap.
- **Then — D1 Guard prototype:** observe query-returned rows-read/written metadata first. Add coordinated counters and idempotent event ingestion, quantify concurrency/overshoot, and test bypass paths. Only then add opt-in blocking of future wrapped operations. One expensive query can exceed a threshold before its cost is reported; this is a circuit breaker, not a guaranteed account-wide hard cap.
- **Later — incidents:** correlate deployments with measured usage changes and retain evidence. Correlation alone does not establish causation. Emergency changes to production routing require a separately reviewed design.

Every completed implementation milestone is committed with a matching changelog entry and synchronized three-part version. Current initial-release line: 0.0.x.
