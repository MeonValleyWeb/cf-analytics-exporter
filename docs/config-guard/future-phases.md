# Config Guard future phases

## GitHub Action and CI output

Reuse the parser, remote mapper, and drift engine in a standalone package with:

- JSON and SARIF output;
- documented exit codes for pass, warning, drift, and operational failure;
- pull-request annotations that never expose values;
- explicit environment/account/Worker inputs; and
- short-lived or repository-scoped Cloudflare credentials.

This should follow live acceptance of the `0.8.0` API shapes and drift rules.

## CLI

`cf-analytics drift` is deliberately deferred. The web repository currently
uses Clerk plus encrypted Supabase token storage and has no local credential
provider, command package, distribution channel, or exit-code contract.

A future CLI should define, before implementation:

- token lookup and precedence without printing credentials;
- account and environment selection;
- interactive versus non-interactive operation;
- human, JSON, and SARIF formats;
- stable exit codes; and
- npm/package distribution and version compatibility.

The `0.8.0` product modules are deliberately reusable so a CLI does not need a
second comparison engine.

## Broader Cloudflare resources

Candidate read-only comparisons after Workers:

- Worker routes and custom domains;
- cron triggers;
- backing KV, D1, R2, Queue, Vectorize, Hyperdrive, Workflow, and service-binding
  resource identity;
- Worker versions and deployment percentages;
- account settings and subdomains;
- Pages projects;
- WAF/rulesets, DNS, cache settings, and zone configuration; and
- Terraform/Pulumi state inputs alongside Wrangler.

Each resource needs its own ownership, permissions, API-shape, false-positive,
and remediation design before being added.

## Product operations

- Scheduled checks and evidence history.
- Change notifications with quiet-on-no-change behaviour.
- Multi-token and accounts-without-zones support.
- Framework-generated config discovery in a trusted local/CLI context.
- Team roles, acknowledgements, and reviewed-exception policies.
- Optional automatic remediation only under a separate, explicitly approved
  write-capable milestone with backups, previews, and audit logs.
