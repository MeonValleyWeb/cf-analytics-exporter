# Verify Cloudflare data before collection

Phase 2 code is implemented, but actual zone access and metric fidelity are not established by synthetic tests. This workflow makes read-only Cloudflare queries and does not deploy or change secrets.

## Configure locally

Copy `.dev.vars.example` to the ignored `.dev.vars` file and set `CF_API_TOKEN`, `EXPORT_API_KEY` and `CF_ALLOWED_ZONE_IDS`. Keep the Cloudflare token scoped to Analytics Read for the target zones. Never paste secrets into chat or commit the file. The verifier loads this file through Node's environment-file support.

Run:

```sh
npm run verify:cloudflare
```

By default it uses the first allowed zone. Select another allowed zone with `--zone ZONE_ID`.

The verifier queries settings and retrieves the previous complete UTC day and seven complete UTC days. It reports availability, query limits, retained history, returned/missing-day counts and totals. It also checks that the day returned alone matches that day inside the seven-day result. Missing dates remain unknown rather than zero-filled. No matching real data is assumed from an HTTP 200 alone.

## Independent dashboard comparison

Use the same zone, UTC boundaries, requests and bytes in Cloudflare's dashboard. Do not compare human visitors, browser pageviews or rounded bandwidth values with request counts and raw bytes. If exact matching totals are unavailable in the chosen dashboard view, record that as a verification limitation. Document data delays or sampling differences; do not edit expected totals simply to make the test pass.

Create an ignored local baseline file, e.g. `.verification/baseline.json`:

```json
{
  "zoneId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "windows": [
    { "from": "2026-09-04", "to": "2026-09-05", "requests": 123, "bytes": 4567 },
    { "from": "2026-08-29", "to": "2026-09-05", "requests": 890, "bytes": 12345 }
  ]
}
```

These are placeholders, not observed values. Supply real independently observed totals and current retained dates. The first window must cover one day; the second seven days, both ending on the same exclusive UTC date. All expected totals must be non-negative safe integers. The API still validates the dates and actual retention.

```sh
npm run verify:cloudflare -- --baseline .verification/baseline.json --output .verification/report.json
```

Create the `.verification` directory first. Output reports are written with mode 0600 and refuse to overwrite an existing file. Reports contain private traffic totals and zone metadata, but never tokens or raw upstream errors. Without `--output`, the report is printed to the terminal.

## Interpretation

- `verified` / exit 0: both windows are complete, totals match the independent baseline, and the one-day/seven-day consistency check passes.
- `awaiting-dashboard-comparison` / exit 2: complete, internally consistent data was fetched, but no independent baseline was provided.
- Missing local configuration / exit 2: no Cloudflare request is made.
- `incomplete-data` / exit 1: at least one day is missing; zero traffic has not been proven.
- `failed` / exit 1: access, schema, data, consistency or baseline comparison failed. Errors are sanitized.

A successful check establishes only the chosen zone, metrics and windows at that moment. Preserve a redacted real-response fixture and record the dashboard view/timezone used before marking phase 2 accepted. Higher-detail datasets need separate validation. Phase 3 collection should use the verified contract.

## Source semantics

[Cloudflare settings node](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/) documents availability, nested field paths, maximum duration/page size and historical retention. The implementation requires `dimensions_date`, `sum_requests` and `sum_bytes`, with at least three selected fields permitted. It rounds the retention cutoff up to the first complete UTC day. Live verification must confirm these documented conventions against the actual dataset schema; unavailable settings produce explicit errors.
