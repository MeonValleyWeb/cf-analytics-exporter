# Config Guard security and testing

## Secret handling

Config Guard operates on secret names, never secret values.

- The file picker accepts only Wrangler config filenames, not `.env` or
  `.dev.vars`.
- Raw Wrangler text exists only inside the browser file handler while parsing.
- `vars` values and backing resource identifiers are removed by the local
  mapper before a request can be created.
- The server allowlists every request field and reconstructs a normalized copy;
  extra binding properties such as `value` are rejected.
- Cloudflare secret responses are immediately reduced to `name` and `type`.
- Tests inject fake fetch responses containing sentinel secret/plain-text values
  and prove those sentinels do not survive normalization.
- The stored Cloudflare token remains encrypted at rest and is decrypted only in
  authenticated server code.
- Config Guard never logs the raw request body, local config, token, Cloudflare
  response, or normalized secret list.

## Request and identifier controls

- Clerk supplies the user identity; a browser user ID is never accepted.
- Account IDs must be 32-character hexadecimal strings and must appear in the
  stored token's zone-derived account list.
- Worker script names are length/character bounded and URL-encoded before use.
- Binding and secret names must be JavaScript-style binding identifiers.
- Flags, warnings, observability fields, bindings, and secret lists all have
  explicit count and length limits.
- Local Wrangler files are capped at 512 KiB; API requests advertise a 128 KiB
  limit and the normalized schema is substantially smaller.

## Test layout

- `test/wrangler-config.test.js`: JSON/JSONC/TOML, environments, value stripping,
  size/format errors, and warnings.
- `test/request-validation.test.js`: strict metadata contract, identifiers,
  duplicates, dates, and observability rates.
- `test/remote-mapper.test.js`: settings and secret reduction.
- `test/drift-engine.test.js`: pass, warning, drift, exact differences, ordering,
  and status precedence.
- `test/cloudflare-api.test.js`: endpoint paths, auth header, success mapping,
  permissions, not found, and rate limiting.
- `test/fixtures/config-guard/`: fake Wrangler files with no live credentials or
  production resource identifiers.

Run the release checks:

```sh
npm test
npm run lint
npm run format:check
npm run check
npm run build
```

All automated tests are credential-free. CI must not use a customer Cloudflare
token.

## Manual acceptance

Credential-backed acceptance should use a disposable or representative Worker
and verify, without exposing values:

1. matching state returns `PASS`;
2. an intentionally missing required secret returns `DRIFT`;
3. a stale remote secret returns `DRIFT`;
4. missing/unexpected/type-mismatched bindings are distinct;
5. compatibility date and flag differences are exact;
6. supported observability differences are exact;
7. removing `Workers Scripts Read` returns `WARNING`; and
8. no check mutates Worker settings or secrets.

Signed-out browser acceptance must confirm `/config-guard` preserves the return
URL through Sign In. Authenticated rendering and live API shape acceptance
remain pending until suitable credentials are provided.
