# Cloudflare analytics exporter

Canonical checkout: `/Users/andrew/Projects/personal/cf-analytics-exporter`. All source, configuration and Git history live directly here; the historical `magenta-meteor` wrapper directory has been removed.

Dashboard, saved account connections, private daily request/bandwidth exports and on-demand billing ingestion on Astro 7.3 and Cloudflare Workers. See `docs/development-plan.md` for the phased reporting roadmap.

## Local setup

Use Node 24 (`nvm use`) and `npm ci`. Copy `.dev.vars.example` to `.dev.vars`, then configure:

| Binding | Purpose |
| --- | --- |
| `CF_API_TOKEN` | Cloudflare Analytics Read token scoped to required zones. |
| `EXPORT_API_KEY` | Separate random bearer secret of at least 32 characters for API callers. |
| `CF_ALLOWED_ZONE_IDS` | Comma-separated list of permitted 32-character zone IDs. |

Generate a caller secret using `openssl rand -hex 32`. Never put either secret in URLs, frontend code, logs or committed files. Without valid configuration the exporter returns 503; unauthenticated requests return 401. The allowlist applies to all callers holding this single-owner API key; this is not tenant isolation.

- `npm run dev`: local Workers development.
- `npm test`: exporter, capabilities and verification regression tests with mocked Cloudflare responses.
- `npm run verify:cloudflare`: read-only live discovery and one-day/seven-day checks using `.dev.vars`. See `docs/live-verification.md`.
- `npm run build`: compile the Worker and assets.
- `npm run preview`: preview the production build locally.
- `npm run deploy`: build and deploy using Wrangler.

Deployment targets the `cf-analytics-exporter` Worker in the Meon Valley Web account. See `docs/workers-migration.md` for runtime secrets, deployment, verification and rollback. `npm run deploy:check` builds and validates the upload without publishing.

## Dashboard

Clerk protects `/dashboard`, `/settings` and each dashboard API. Configure `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Worker secrets. Astro uses the `PUBLIC_` prefix, not Next.js's `NEXT_PUBLIC_` prefix. Supabase retains the existing `cf_tokens` table with a unique `user_id` and `api_token`/`updated_at` columns.

`POST /api/dashboard-export`, `/api/cf-store-token`, `/api/cf-zones` and `/api/validate-token` require a verified Clerk session. Saved tokens are selected using the verified user identity; a submitted user ID grants no access. Dashboard traffic queries retain the existing hourly dataset and chart response shape, with a maximum 31-day range and 25-second upstream budget. Current chart status/security figures are legacy approximations from threat totals, not true status-code/security-event breakdowns; geographic data is unavailable. The machine daily API below has separate capabilities and authentication.

## API

`GET /api/ping` is public and returns health status only.

`GET /api/cf-export` accepts `zoneId`, `from`, `to`, and `format`. Send `Authorization: Bearer <EXPORT_API_KEY>` as a header. `POST /api/cf-export` accepts the same fields as an `application/json` object (maximum 4096 bytes).

Example parameters:

```json
{
  "zoneId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "from": "2026-09-01",
  "to": "2026-09-03",
  "format": "csv"
}
```

Dates must be real `YYYY-MM-DD` UTC dates. `from` is inclusive, `to` exclusive. Only 1–366 complete UTC days are allowed, subject to discovered retention and at most 32 data windows; `to` cannot exceed today. `to` defaults to today in UTC; `from` defaults to seven days before `to`. Timestamp strings, unknown parameters, duplicate parameters and invalid formats are rejected.

`format=json` (default) retains the array of `{ dimensions: { date }, sum: { requests, bytes } }`. CSV downloads contain `date,requests,bytes`. Missing dates are not filled with zeros. Both responses are non-cacheable and include `X-Export-Dataset`, `X-Export-Window-Count` and `X-Export-Missing-Days` headers. A valid empty dataset is distinguished from a failed request, but missing days do not prove zero traffic.

Errors use `{ "error": { "code": "...", "message": "..." } }`:

- 400: invalid input; 401: missing/invalid bearer key; 403: disallowed zone.
- 405: unsupported method; 413: oversized body; 415: unsupported POST content type.
- 422: dataset/field access unavailable, history outside retention, unsupported limits or too many query windows.
- 502: upstream rejection, malformed data or network failure; 503: missing configuration or transient upstream HTTP failure; 504: upstream timeout.

Cloudflare HTTP 429/500/502/503/504 and transport failures may be retried once. Each upstream attempt has a 10-second timeout; a shared 25-second abort signal bounds the upstream operation across discovery and data windows. Long Retry-After delays are returned to the caller rather than blocking a Worker. Raw upstream errors are not exposed. Cloudflare query variables carry validated identifiers/dates; the numeric row limit is derived from validated settings and the number of days in each window. Returned dates/totals are validated before export. Windows are disjoint, daily row limits fit the maximum possible day count, and a failed window discards the whole export.

The former `/.netlify/functions/*` URLs redirect with HTTP 307 to preserve POST requests. The Netlify implementation has been replaced by `src/lib/exporter.js` and Astro routes.

## Dataset capabilities

`GET /api/capabilities?zoneId=...` requires the same bearer token and zone allowlist. It queries the Cloudflare settings node and returns dataset availability, permitted fields, duration/page limits, retention, earliest complete retained UTC day and maximum window size. Disabled datasets return metadata with `canExport: false`; invalid/missing settings are errors, never assumed entitlements.

Every export discovers fresh limits. The date window is split by both maximum query duration and maximum daily rows. Requests outside known retention are rejected rather than silently shortened. The first partly retained UTC day is excluded conservatively. Unavailable days/fields or zero usable limits prevent data queries. At most 32 data windows plus discovery are allowed; no persistent capability cache or rate limiter exists yet.

## Current limitations

Live schema access, metric accuracy and zone-specific retention still need phase 2 verification. There is no persistent rate limiting, scheduled collection, database or reporting UI yet. A shared bearer secret is for trusted machine clients; the future browser dashboard needs session authentication. The 366-day application ceiling does not imply that a zone retains a year of data. Live settings and metric fidelity remain unverified until actual credentials and dashboard comparison are available. Fixtures in `test/fixtures` are explicitly synthetic.

Cloudflare dataset limits: https://developers.cloudflare.com/analytics/graphql-api/limits/

## Billing and release workflow

Version 0.0.2 adds `GET /api/billing?accountId=...` and `npm run ingest:billing` for current-billing-period cost ingestion. Configure a separate `CF_BILLING_API_TOKEN` and `CF_ALLOWED_ACCOUNT_IDS`; the existing `EXPORT_API_KEY` authenticates callers. See `docs/billing.md` for setup, monetary semantics, source freshness and live acceptance requirements.

Completed milestones use 0.0.x versions with synchronized package/lockfile metadata, a `CHANGELOG.md` entry and a local Git commit. Run `npm test` and `npm run build` before committing. The release test checks version/changelog consistency. Commits do not automatically publish, push or deploy.
