# Config Guard architecture

## Scope

Config Guard `0.8.0` performs an explicit, on-demand comparison between one
local Wrangler configuration environment and one deployed Cloudflare Worker.
It is read-only with respect to Cloudflare.

```text
Local wrangler.json/jsonc/toml
  -> parsed in the browser
  -> values and resource identifiers discarded
  -> normalized declaration metadata
  -> Clerk-authenticated POST /api/config-guard
     -> encrypted token lookup in Supabase
     -> token-visible zone/account ownership check
     -> Cloudflare Worker settings GET
     -> Cloudflare Worker secrets GET
     -> metadata-only remote mappers
     -> pure drift engine
  <- PASS / WARNING / DRIFT, safe evidence, exact differences, manual guidance
```

No Config Guard route calls a Cloudflare `POST`, `PUT`, `PATCH`, or `DELETE`
endpoint. The product does not provide an Apply or Fix control.

## Browser boundary

`src/lib/config-guard/wrangler-config.js` parses `wrangler.json`,
`wrangler.jsonc`, and `wrangler.toml`. `ConfigGuard.tsx` reads the selected file
with the browser File API and does not store the raw source in React state,
browser storage, or a server request.

The parser resolves the default and named environments, then returns only:

- Worker and account identifiers;
- compatibility date and flag names;
- supported observability booleans and sampling rates;
- required secret names; and
- binding names and types.

It discards `vars` values, resource IDs/names, routes, source paths, build
settings, and other unrelated configuration. The UI shows the normalized
metadata before a check can be run.

## Environment resolution

The default environment uses top-level declarations. A named environment:

- inherits `name`, `account_id`, `compatibility_date`, `compatibility_flags`,
  and `observability` unless overridden;
- does not inherit bindings, `vars`, or `secrets.required`; and
- resolves to an explicit environment `name`, or
  `<top-level-name>-<environment-name>` when no override is present.

This follows Wrangler's documented inheritable/non-inheritable split. Config
Guard does not read `.env`, `.dev.vars`, or process environment values.

## Server boundary

`POST /api/config-guard` exists because the normalized declaration is request
input. The Cloudflare operations inside it remain GET-only.

The route:

1. derives identity from Clerk;
2. enforces a bounded, allowlisted metadata schema;
3. loads the user's encrypted Cloudflare token server-side;
4. re-enumerates the token-visible zones;
5. requires the selected account to appear in the derived account list;
6. reads Worker settings and secret metadata concurrently;
7. maps both responses to safe metadata; and
8. runs the pure drift engine.

The response contains source availability, scan time, normalized deployed
metadata, differences, and `readOnly: true`. It never contains the Cloudflare
token, request headers, plain-text variable values, resource identifiers, or
secret values.

## Drift engine

`src/lib/config-guard/drift-engine.js` is deterministic and has no network,
authentication, persistence, or browser dependency.

- `PASS`: every supported comparison matches and both remote evidence reads
  succeeded.
- `WARNING`: evidence is unavailable or a declaration is outside the supported
  `0.8.0` field boundary, with no known drift.
- `DRIFT`: at least one supported declared/deployed value differs. A DRIFT result
  takes precedence over warnings.

Each difference has a stable ID, category, kind, safe declared and deployed
metadata, explanation, and manual remediation.

## Components

- `src/lib/config-guard/wrangler-config.js`: browser-safe config parser and
  declaration mapper.
- `src/lib/config-guard/request-validation.js`: strict server payload boundary.
- `src/lib/config-guard/remote-mapper.js`: immediate reduction of Cloudflare
  settings and secrets responses.
- `src/lib/config-guard/drift-engine.js`: comparison rules and status
  precedence.
- `src/lib/server/cloudflare-api.js`: injected-fetch Worker settings and secret
  metadata reads.
- `src/pages/api/config-guard.js`: authentication, ownership, evidence, and
  assessment orchestration.
- `src/components/ConfigGuard.tsx`: local file selection, metadata preview,
  explicit scan action, evidence, differences, and guidance.
- `src/pages/config-guard.astro`: authenticated product route.

## Known boundaries

- Accounts are derived from zones visible to the stored token. An account with a
  Worker but no token-visible zone cannot be selected in `0.8.0`.
- Config Guard compares binding names and types, not backing resource IDs or
  names.
- Framework-generated bindings appear as unexpected unless the generated
  Wrangler configuration is selected instead of the source configuration.
- Missing fields are not inferred from dashboard defaults. Observability is
  compared only where the local field is explicit and the API returns a value.
- Live credential-backed acceptance is manual and environment-specific.
