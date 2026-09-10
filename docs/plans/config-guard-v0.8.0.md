# Config Guard v0.8.0 implementation plan

Status: approved for implementation  
Milestone: `0.8.0`  
Target release: September 2026

## Outcome

Add a read-only Config Guard to CF Analytics. A signed-in user can choose a local
Wrangler configuration, select the relevant Cloudflare account and environment,
and compare the declared Worker configuration with the currently deployed
Worker state.

The first release detects:

- required secrets missing from the deployed Worker;
- remote secrets not declared as required;
- missing, unexpected, and type-mismatched bindings;
- `compatibility_date` mismatch;
- `compatibility_flags` mismatch; and
- observability mismatch for fields present in both supported configuration and
  the Cloudflare settings response.

Every result is `PASS`, `WARNING`, or `DRIFT`, includes the exact metadata-only
difference, and provides a manual remediation. Config Guard never changes a
Cloudflare resource.

## Repository audit before implementation

- The clean `main` checkout is at Crawler Guard `0.7.0`, 15 local commits ahead
  of `origin/main`; no existing work has been pushed by this task.
- Astro 7 renders server-side on Cloudflare Workers, with React islands and
  Tailwind CSS 4.
- Clerk authenticates API routes. A Supabase service-role client stores one
  Cloudflare token per user, encrypted with AES-256-GCM.
- `src/lib/server/cloudflare-api.js` is the existing injected-fetch Cloudflare
  REST adapter. `/api/cf-zones` derives account IDs from token-visible zones.
- Crawler Guard provides the established read-only API, pure-engine, React UI,
  evidence, limitation, and manual-remediation patterns.
- The project has no `bin`, command package, reusable local credential provider,
  or CLI distribution architecture.
- Baseline verification passed: 15 tests, formatting, Astro checks, production
  build, and lint with 13 pre-existing `no-explicit-any` warnings.
- CodeGraph was initialized locally at the user's request and reported a healthy
  index before this plan was written.

## Design

### 1. Browser-local Wrangler parsing

Create a dependency-free product module boundary backed by explicit direct
dependencies for JSONC and TOML parsing. It will accept:

- `wrangler.json`;
- `wrangler.jsonc`; and
- `wrangler.toml`.

Cloudflare currently supports all three, while recommending JSONC for new
projects. The parser will:

- enforce a bounded text size and supported filename;
- parse the file entirely in the browser;
- expose the default and named environments;
- apply Wrangler's documented environment rules: inheritable fields fall back
  to the top level, while bindings, variables, and secrets are not inherited;
- resolve a named environment to its explicit `name` or the documented
  `<top-level-name>-<environment-name>` Worker name;
- normalize only field names, binding types, dates, flags, and observability
  booleans/rates; and
- discard variable values, resource IDs, bucket/database names, routes, and all
  other unrelated configuration before the API request is constructed.

The raw file is never sent to CF Analytics, stored, logged, or added to browser
storage. `vars` values are deliberately ignored. Secret names come only from
Wrangler's `secrets.required` declaration; `.dev.vars` and `.env` files are not
accepted.

Initial binding coverage will include Wrangler's common first-class binding
fields: plain-text `vars`, KV, Durable Objects, R2, D1, services, Analytics
Engine, Workers AI, Browser Rendering, Images, Vectorize, Hyperdrive, queues,
workflows, mTLS certificates, dispatch namespaces, pipelines, send-email, and
version metadata. Unsupported or malformed binding declarations produce a
visible warning rather than a silent pass.

### 2. Cloudflare Worker read adapter

Extend the injected-fetch server adapter with metadata-only reads:

```text
GET /accounts/{account_id}/workers/scripts/{script_name}/settings
GET /accounts/{account_id}/workers/scripts/{script_name}/secrets
```

Both endpoints accept `Workers Scripts Read`; Config Guard will never call their
write equivalents. The adapter will:

- URL-encode account and script identifiers;
- normalize permission, not-found, rate-limit, invalid-response, and general
  upstream failures;
- immediately reduce settings bindings to names and types;
- reduce secret responses to names and secret types; and
- never return or log binding values, secret values, request headers, or the
  stored Cloudflare token.

The deployed mapper will normalize the API's ISO-style compatibility date to
`YYYY-MM-DD`, sort flags, remove secret bindings from the ordinary binding set,
and retain only supported observability fields.

### 3. Pure drift engine

Create a deterministic module with no network, authentication, persistence, or
UI dependency. It compares normalized declared and deployed metadata and
returns:

- `DRIFT` when a required secret or binding is missing, an undeclared remote
  secret or binding exists, a binding type differs, or a declared runtime or
  observability value differs;
- `WARNING` when a comparison cannot be completed or a declaration is outside
  the first-release support boundary; and
- `PASS` when every supported declared field matches and both remote evidence
  reads succeeded.

Each difference will include a stable identifier, category, exact field or
binding name, declared/deployed metadata where safe, explanation, and manual
remediation. Secret findings expose names and types only.

Observability comparison is presence-aware. Config Guard will compare only the
supported observability properties explicitly declared in the selected
environment; absence is treated as unspecified rather than inventing a local
default.

### 4. Authenticated assessment API

Add `POST /api/config-guard` because a normalized declaration is request input;
the Cloudflare side remains GET-only.

The route will:

1. require Clerk authentication;
2. validate a small, bounded metadata-only JSON body;
3. load the signed-in user's encrypted token;
4. re-enumerate the token-visible zones and require the selected account ID to
   be one of their derived accounts;
5. fetch Worker settings and secret metadata concurrently;
6. normalize remote metadata and run the pure drift engine; and
7. return only evidence metadata, differences, status, guidance, scan time, and
   an explicit `readOnly: true` marker.

Account validation preserves the existing ownership pattern and prevents the
endpoint being used as a general account-ID probe. Its first-release limitation
is that an account with Workers but no zone visible to the stored token cannot
be selected.

### 5. Config Guard interface

Add `/config-guard` and a navigation entry consistent with Crawler Guard. The
page will:

- explain that file parsing stays in the browser;
- accept one supported Wrangler file;
- show the resolved Worker, named environments, binding count, and required
  secret names without showing values;
- group account choices using the existing authenticated zone response;
- require an explicit **Run drift check** action;
- render the overall `PASS`, `WARNING`, or `DRIFT` state;
- group exact differences by secrets, bindings, runtime, and observability;
- show safe declared/deployed evidence and manual remediation; and
- provide no apply, upload, patch, or delete control.

### 6. CLI decision

Do not add a CLI in `0.8.0`. The current project is a Clerk/Supabase-backed web
application and has no standalone auth, token discovery, command packaging, or
machine-readable exit-code contract. Adding `cf-analytics drift` now would
create an unrelated credential/runtime architecture and duplicate the web API
security boundary.

A later CLI milestone can reuse the parser, mapper, and pure drift engine after
defining local token sourcing, account selection, JSON output, exit codes, and
package distribution. The first-release product modules will remain reusable so
that deferral does not create throwaway work.

### 7. Tests and verification

Use Node's built-in test runner and injected fetch implementations. Add fixtures
for JSONC and TOML without real identifiers or credentials. Cover:

- supported filenames, parse errors, size limits, and named environments;
- non-inherited environment bindings and secrets;
- metadata-only normalization across supported binding fields;
- settings and secret adapter success and error states;
- remote binding/date/flag/observability mapping;
- every required drift rule, unknown evidence, ordering, and status precedence;
- secret-value stripping even if an upstream mock includes a value; and
- API payload validation through directly testable helpers where practical.

Run tests, lint, formatting, Astro checks, production build, and signed-out route
smoke/visual checks. Live settings comparison remains pending until a signed-in
user supplies a token with `Zone:Read` and `Workers Scripts Read` for a
representative account.

## Documentation and release tracking

- Add Config Guard architecture, supported-field matrix, Cloudflare API
  assumptions/limitations, security, testing, and future-phase documentation.
- Update README, product roadmap, repository guidance, token-permission copy,
  and navigation.
- Release as semantic milestone `0.8.0`; update `package.json` and
  `package-lock.json` together.
- Maintain `CHANGELOG.md` in every logical commit.
- Finish with `docs/config-guard/implementation-summary-v0.8.0.md`, including
  delivered scope, commit map, verification evidence, and pending live checks.

## Commit plan

1. `docs: plan Config Guard v0.8.0`
2. `feat: add Config Guard parsing and drift engine`
3. `feat: add Config Guard Cloudflare API`
4. `feat: add Config Guard interface`
5. `docs: release Config Guard v0.8.0`
6. `test: complete Config Guard release verification` only if verification
   requires a distinct corrective stage

## Out of scope and future phases

- Cloudflare mutations, automatic remediation, or secret deletion.
- Reading secret values or accepting `.dev.vars`/`.env` files.
- Pages, zones, D1, R2, KV, Queues, routes, domains, cron triggers, or other
  resources as independent drift targets.
- Comparing binding resource IDs or names beyond the binding name/type contract.
- Generated Wrangler configuration discovery; users can select the generated
  config directly when a framework redirects deployment configuration.
- Scheduled scans, persisted evidence/history, notifications, and GitHub Action
  checks.
- A CLI, JSON/SARIF output, and CI-specific exit codes.
- Live customer-credential checks in automated tests.

## Sources reviewed

Cloudflare documentation was checked on September 10, 2026:

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)
- [Get Worker settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/)
- [List Worker secrets](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/list/)
