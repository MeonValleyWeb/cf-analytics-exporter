# Monthly Site Health report

Status: implementation plan. Track under Unreleased while the existing R2 Storage
Guard version remains reserved.

## Scope

Generate a read-only report for one Cloudflare zone on demand. Compare the last
30 complete UTC days with the preceding 30 complete UTC days. Show request
volume, edge response bytes, cache hit share, and the distribution of actual
edge HTTP response statuses, including 4xx and 5xx rates. Show exact reporting
windows and explicit missing-data reasons. Provide a print layout for the
browser's Save as PDF action and a CSV of the same report snapshot.

## Data and access

- Use the existing Clerk session and encrypted per-user Cloudflare token.
  Populate the selector from token-visible zones and authorize the submitted
  zone through Cloudflare's zone details endpoint using the same token. Keep
  reports private and out of shared caches.
- Read the zone's GraphQL dataset settings before querying
  `httpRequestsAdaptiveGroups`. Use its reported retention, request window and
  page size. Query bounded chunks with an exclusive end timestamp and the
  external client request filter. Never present a clipped window as a complete
  comparison. An older period outside retention stays unavailable.
- Read counts and bytes, group HTTP responses by edge status, and group cache
  counts by cache status. Use weighted rates from grouped counts. Include a
  separate category for unknown edge statuses and exclude them from the 4xx/5xx
  denominator. Cache hit share counts literal HIT responses. Label Cloudflare
  aggregates as potentially sampled. Mark incomplete metrics unavailable and
  suppress comparisons where either value is missing.
- Leave the existing dashboard and CSV contract in place. The report has its
  own verified HTTP status data source. Scheduling, white-label templates,
  storage and production deployment are outside this change.

## Commit and verification stages

1. Commit this plan and its changelog entry.
2. Commit report windows, Cloudflare adapter, aggregation, CSV, and
   credential-free tests. Exercise invalid input, coverage, real status
   grouping, zero baselines and upstream failures.
3. Commit the authenticated report page, print layout, dashboard entry point,
   user documentation and changelog. Run the repository checks, inspect the
   report at desktop and mobile widths, and verify a PDF with synthetic
   evidence. Record any live Cloudflare acceptance gap separately.

## Sources

- [Cloudflare dataset settings](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/)
- [Cloudflare HTTP analytics by hostname](https://developers.cloudflare.com/analytics/graphql-api/tutorials/end-customer-analytics/)
- [Cloudflare cache response meanings](https://developers.cloudflare.com/cache/concepts/cache-responses/)
