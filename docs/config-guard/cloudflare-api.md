# Config Guard Cloudflare API assumptions

Last reviewed: September 10, 2026.

## Authentication and account ownership

Config Guard reuses the encrypted bearer token already stored for the signed-in
Clerk user. It requires:

- `Zone:Read` for the existing paginated zone list and account ownership check;
  and
- `Workers Scripts Read` for Worker settings and secret metadata.

The account list is derived from each zone's `account` object. This avoids
adding a separate account-list permission, but excludes accounts with no zone
visible to the token.

## Worker settings

Config Guard calls:

```text
GET /client/v4/accounts/{account_id}/workers/scripts/{script_name}/settings
```

Cloudflare documents this endpoint as returning Worker metadata and settings,
including bindings, compatibility date/flags, and observability where
available. The adapter keeps only:

- binding name and type;
- compatibility date;
- compatibility flag names; and
- supported observability booleans, rates, and status strings.

Binding values, resource identifiers, routes, migrations, annotations, and
other response properties are discarded before the API route receives the
normalized result.

Official reference: [Get Worker settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/).

## Secret metadata

Config Guard calls:

```text
GET /client/v4/accounts/{account_id}/workers/scripts/{script_name}/secrets
```

Cloudflare documents `Workers Scripts Read` as an accepted permission. The
adapter keeps only each secret's `name` and `type`. It deliberately discards
every other property, including if a mocked, changed, or unexpectedly broad
response contains `text`, key material, or usage metadata.

Official reference: [List Worker secrets](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/list/).

## Error mapping

Both reads normalize expected failures:

| HTTP/result                                | Config Guard evidence status |
| ------------------------------------------ | ---------------------------- |
| Success                                    | `available`                  |
| 401/403                                    | `permission_required`        |
| 404                                        | `not_found`                  |
| 429                                        | `rate_limited`               |
| Invalid JSON, network error, other failure | `unavailable`                |

An unavailable source produces `WARNING`. If one source succeeds, its known
drift remains visible even when the other source is unavailable.

## Wrangler source-of-truth assumptions

Cloudflare recommends treating the Wrangler file as the Worker configuration
source of truth and documents that remote secrets persist until explicitly
deleted. This is why an undeclared remote secret is a `DRIFT` result rather than
being silently ignored.

Cloudflare also documents generated deployment configurations under
`.wrangler/deploy/config.json`. Config Guard does not discover local project
files or follow that pointer in the browser. When a framework deploys a generated
config, select that generated Wrangler file for the meaningful comparison.

Official references:

- [Wrangler configuration and source of truth](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/)

## Limitations

- The settings API schema marks several properties optional. Config Guard does
  not infer absent values.
- Only deployed script-level settings are compared. Version history and gradual
  deployments are not inspected.
- Script names are resolved from Wrangler environment semantics; Config Guard
  does not search the account for similar Worker names.
- Binding backing-resource equality is not proved in `0.8.0`.
- No Cloudflare write endpoint is implemented or called.
