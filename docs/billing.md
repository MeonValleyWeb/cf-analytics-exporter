# Billing ingestion — 0.0.2

## What is available

`GET /api/billing?accountId=...` retrieves coverage/subscription information and the account's current billing-period usage. It requires the existing exporter bearer credential plus separate server-side billing configuration:

- `CF_BILLING_API_TOKEN`: a token with Billing Read permission for the required accounts.
- `CF_ALLOWED_ACCOUNT_IDS`: comma-separated account IDs permitted by this application.
- `EXPORT_API_KEY`: the private API caller secret (shared with the single-owner traffic API).

Billing does not require `CF_API_TOKEN` or zone bindings and never falls back to an Analytics Read token. Configuring billing grants existing holders of the exporter key access to the allowed accounts' cost data; the current key model is for one trusted owner, not separate tenants. No credentials have been created or deployed.

The endpoint uses the documented V1 paths `/accounts/{id}/billable-usage/info` and `/accounts/{id}/billable-usage`. The SDK's old `paygo` method name is deprecated in favor of `getAccountUsageV1`; the URL is unchanged. The different V2 `/billable/usage` endpoint is not substituted: current SDK documentation says its cost fields are not yet populated.

Only `accountId` is accepted. Arbitrary dates are deliberately unsupported because the V1 query window must include the subscription billing-cycle anchor. Current-period requests omit `from` and `to` so Cloudflare chooses the correct billing period; this is not the calendar month assumption used by some dashboards.

## Response semantics

- `rows`: validated account, service, subscription/zone attribution, billing/charge periods, usage units and amounts.
- Monetary and quantity values are returned as decimal strings (or null when unavailable). Summaries add the decimal representations without floating-point addition. Source JSON numbers may already have limited precision; the application cannot recover precision lost upstream.
- `summaries`: period `ContractedCost` by service, currency and billing-period start. Different currencies/periods stay separate. `CumulatedContractedCost` is retained on rows but is never summed.
- `contractedCost: null` means at least one contributing cost is unknown. `knownContractedCost` is the sum of known rows, not a full bill.
- `status: no-data` does not imply zero spend. Unknown costs produce `partial-cost-data`.
- `collectedAt` identifies this collection request; `sourceUpdatedAt: null` means the API supplied no authoritative refresh timestamp. Latest charge-period end is coverage metadata, not proof of freshness.
- The source updates daily. Cloudflare's invoice remains authoritative. These snapshots cannot enforce a hard spending cap.

All responses are no-store. Unsupported accounts, cross-account rows, invalid costs/timestamps, incomplete envelopes and signaled pagination fail explicitly. Each HTTP request has at most two attempts and a 10-second timeout under the shared 25-second abort deadline. No upstream redirects are followed. The current implementation limits a snapshot to 10,000 rows.

## Local snapshot ingestion

Populate the ignored `.dev.vars` file using `.dev.vars.example`, then run:

```sh
npm run ingest:billing
# Or choose another explicitly allowed account:
npm run ingest:billing -- ACCOUNT_ID
```

The command retrieves and normalizes a current-period snapshot and writes a unique `.verification/billing-*.json` file with mode 0600. The directory is ignored by Git. Failures do not produce a successful snapshot. Missing configuration or no/partial data returns exit 2; errors return exit 1; available cost data returns exit 0. Exit 0 means ingestion succeeded, not that invoice reconciliation was performed.

Snapshots may overlap or contain corrections on later fetches. Never add snapshots together as independent spend. Scheduled persistent ingestion will need atomic snapshot replacement or a verified stable row identity; V1 does not expose a universal row ID, so this milestone does not invent one.

## Live acceptance still required

1. Confirm account coverage and Billing Read access with real credentials.
2. Compare current-period totals per currency/service with Cloudflare's billable usage view, using the same billing-cycle boundaries and retrieval time.
3. Record delays, empty/free-tier behavior and any unknown fields. Capture a redacted fixture.
4. Confirm the existing production Worker identity before deploying.

Local tests use fabricated billing rows derived from the documented schema, not real account data. There is no automated kill switch, database provisioning or production deployment in this release.

Sources checked 6 September 2026:
- https://blog.cloudflare.com/billable-usage-api/
- https://developers.cloudflare.com/api/resources/billing/subresources/usage/methods/paygo/
- https://raw.githubusercontent.com/cloudflare/cloudflare-typescript/main/src/resources/billing/usage.ts
