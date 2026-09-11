# R2 Storage Guard v0.10.0 product plan

Status: planned next; not in implementation  
Sequence: starts only after Config Guard live acceptance  
Initial release: read-only R2 activity detection

## Outcome

Add an R2 Storage Guard that identifies suspicious or materially unusual object
activity without changing bucket configuration, deleting objects, disabling
access keys, or revoking tokens.

The first release will use Cloudflare R2 Data Access Logs queried through the
Log Explorer API to detect:

- mass-delete and unusually concentrated delete activity;
- delete activity that differs from the bucket's established pattern;
- actors, access keys, Worker scripts, and request interfaces not seen in the
  comparison baseline;
- material read-request or response-byte spikes;
- recurring or related incidents across buckets and time; and
- alert-worthy state changes delivered through opt-in Resend email alerts.

## Sequencing boundary

This document adds the next planned feature only. It does not change, expand, or
interrupt the current Config Guard milestone. R2 Storage Guard implementation
must not begin until Config Guard's authenticated live acceptance and remaining
permission/error-state checks are complete or explicitly rescheduled.

## Cloudflare evidence source

### R2 Data Access Logs

Cloudflare's R2 Data Access Logs record supported successful object operations
from these interfaces:

- `S3` — S3-compatible API requests;
- `API` — Cloudflare dashboard and REST API object operations;
- `Workers` — R2 binding operations, including Worker script identity where
  available; and
- `Public` — unauthenticated `r2.dev` or custom-domain requests.

Relevant fields include event time, bucket, operation, actor type/ID/email or
access key ID, interface, request/response bytes, request URI, IP, user agent,
status, colo, and Worker identity where applicable.

Relevant operations include:

- reads: `GetObject`, `HeadObject`;
- writes/copies: `PutObject`, `CopyObject`;
- listings and multipart operations; and
- deletes: `DeleteObject`, `DeleteObjects`, `DeleteObjectsByPrefix`.

Data Access Logs must be enabled manually per supported bucket before events are
available. v1 will inspect enablement/availability and explain the manual setup;
it will not enable logging automatically.

### Log Explorer API

Use the account-level Log Explorer API with the stored Cloudflare token:

```text
GET  /accounts/{account_id}/logs/explorer/datasets
GET  /accounts/{account_id}/logs/explorer/datasets/{dataset_id}
POST /accounts/{account_id}/logs/explorer/query/sql
```

The SQL endpoint uses `POST` to submit a query body but does not mutate customer
configuration. The server must construct fixed, parameter-validated query
templates; it must not accept arbitrary browser-supplied SQL.

Expected permissions are account-scoped `Logs Read` for Log Explorer evidence
and the minimum read permission needed to enumerate the user's R2 buckets. The
exact token template and plan availability must be revalidated against the live
API before implementation.

## Read-only detection model

### Mass-delete and unusual-delete detection

Evaluate `DeleteObject`, `DeleteObjects`, and `DeleteObjectsByPrefix` using:

- delete request count and rate in short and rolling windows;
- concentration by bucket and object prefix where available;
- first-seen or unusual actor, access key, Worker, IP, user agent, or interface;
- departure from the bucket's time-of-day/day-of-week baseline;
- bulk or prefix-delete operations even when request volume is low; and
- repeated bursts separated by quiet periods.

The logs describe operations rather than a guaranteed per-object deletion
count. v1 must not claim an exact number of deleted objects unless Cloudflare
returns sufficient explicit evidence.

### New actor and interface detection

Build a bounded baseline of actor/interface tuples per bucket, including:

- user actor ID/email metadata;
- S3 access key ID metadata;
- Worker script identity;
- `S3`, `API`, `Workers`, and `Public` interfaces; and
- supporting IP/user-agent metadata where present.

A first-seen tuple is evidence for review, not proof of compromise. Findings
must distinguish a new actor, new interface, new combination, and missing actor
evidence.

### Read-spike detection

Evaluate `GetObject` and `HeadObject` using request rate and `response.bytes`
against rolling bucket baselines. Separate:

- request-count spikes;
- byte-volume spikes;
- public-interface spikes;
- first-seen actor/interface spikes; and
- expected recurring workloads recorded as reviewed exceptions.

The engine must preserve low-data and delayed-data uncertainty rather than
building a confident baseline from incomplete history.

## Findings and incident history

Use a deterministic, versioned detection engine with fixture-driven rules. Each
finding should include:

- status/severity and stable rule ID;
- bucket and observation window;
- operation category and safe aggregate counts/bytes;
- actor/interface evidence with sensitive fields minimized;
- baseline, observed value, and why the threshold fired;
- evidence completeness and query timestamp; and
- exact read-only investigation guidance.

Persist incident history in the existing application datastore only after a
separate schema/data-retention plan. Store normalized aggregates and findings,
not object contents, credential values, or unrestricted raw logs. History should
support first seen, last seen, occurrence count, acknowledgement, resolution,
notes, related findings, and detection-engine version.

Object paths, actor emails, access key IDs, IPs, and user agents may be sensitive.
The implementation plan must define masking, hashing, access control, and
retention before these fields are persisted or sent in alerts.

## Resend alerts

Add opt-in Resend email alerts after incident persistence is reliable. Alerts
should:

- send only for a new actionable incident, meaningful severity increase,
  recurrence after resolution, evidence failure requiring action, or recovery;
- deduplicate and rate-limit repeated findings;
- include bucket, rule, severity, safe aggregates, time window, and a link to the
  authenticated incident detail;
- exclude credentials, secret values, raw access key IDs, full object paths, and
  unrestricted raw log rows;
- require verified destinations and an explicit unsubscribe/mute path; and
- record delivery success/failure without storing provider secrets.

The Resend API key remains a server-side secret. Email delivery failure must not
change the underlying incident result.

## Product surface

Planned v1 surfaces:

- account and bucket selection with Data Access Logs readiness;
- current posture and evidence freshness;
- delete, actor/interface, and read-spike findings;
- bucket timeline and incident history;
- evidence and limitations behind each finding;
- acknowledgement/resolution workflow inside cf-analytics; and
- opt-in alert configuration and delivery state.

No button may revoke a Cloudflare API token, disable an R2 access key, change a
bucket, enable/disable logging, or delete/restore an object.

## Testing and acceptance

- Use synthetic Data Access Log fixtures and mocked Log Explorer responses; CI
  must not require customer credentials.
- Test query bounds, escaping, time windows, pagination/limits, rate limiting,
  permission errors, delayed/missing evidence, and response-shape changes.
- Test mass/bulk/prefix deletion, first-seen actors/interfaces, normal recurring
  jobs, read spikes, sparse baselines, and rule-version migrations.
- Test incident deduplication, acknowledgement/resolution, retention, and
  alert-suppression behavior.
- Test Resend payload redaction and delivery failures without sending real email
  in CI.
- Complete live read-only acceptance on disposable buckets with known synthetic
  operations before describing detection as production-proven.

## Explicit v1 limitations

- Read-only: no automatic token revocation, access-key disablement, bucket
  change, logging change, or object action.
- Data Access Logs are asynchronous and best effort; events can be delayed or
  omitted.
- Requests with response status `400` or higher are excluded, so failed attack
  attempts are not represented.
- Logging is non-retroactive and currently available only for
  non-jurisdictional buckets.
- Data Access Logs are not a complete audit record; use R2 Audit Logs separately
  for bucket-configuration changes.
- A new actor, interface, or spike is anomalous evidence, not proof of malicious
  intent.
- Detection quality depends on sufficient, representative baseline history.

## Later phases requiring separate approval

- Audit Log correlation for R2 configuration changes.
- Scheduled scans, custom detection policies, and team escalation workflows.
- SIEM/webhook destinations alongside Resend.
- Credential-response actions, including token revocation or access-key
  disablement. These are intentionally excluded from v1 and require a separately
  approved, write-capable security milestone with recovery and audit controls.

## Sources reviewed

Cloudflare documentation reviewed September 11, 2026:

- [R2 Data Access Logs](https://developers.cloudflare.com/r2/buckets/data-access-logs/)
- [R2 changelog](https://developers.cloudflare.com/changelog/product/r2/)
- [Log Explorer API](https://developers.cloudflare.com/log-explorer/api/)
- [Run a Log Explorer SQL query](https://developers.cloudflare.com/api/resources/logs/subresources/log_explorer/subresources/query/methods/sql/)
- [R2 Audit Logs](https://developers.cloudflare.com/r2/platform/audit-logs/)
