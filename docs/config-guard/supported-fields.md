# Config Guard supported fields

Config Guard `0.8.0` supports Workers only. It compares configuration metadata,
not resource contents or values.

## Files and environments

| Input                     | Support          | Notes                                                            |
| ------------------------- | ---------------- | ---------------------------------------------------------------- |
| `wrangler.json`           | Supported        | JSON with the same Wrangler field model.                         |
| `wrangler.jsonc`          | Supported        | Comments and trailing commas are accepted.                       |
| `wrangler.toml`           | Supported        | Parsed with the same field model.                                |
| Default environment       | Supported        | Uses top-level declarations.                                     |
| Named environments        | Supported        | Binding, variable, and secret fields are not inherited.          |
| `.dev.vars` / `.env`      | Not accepted     | Prevents secret values entering the workflow.                    |
| Generated Wrangler config | Manual selection | Select the generated file when it is the deploy source of truth. |

The maximum accepted local file size is 512 KiB.

## Runtime and secrets

| Wrangler field        | Comparison                                         |
| --------------------- | -------------------------------------------------- |
| `name`                | Resolves the deployed Worker name.                 |
| `account_id`          | Preselects a token-visible account where possible. |
| `compatibility_date`  | Exact `YYYY-MM-DD` comparison.                     |
| `compatibility_flags` | Order-insensitive exact set comparison.            |
| `secrets.required`    | Compares required names with remote secret names.  |

Secret values are never read from local development files. Cloudflare's secret
list response is immediately reduced to `name` and `type`.

## Binding mapping

| Wrangler field              | Local name field | Remote binding type        |
| --------------------------- | ---------------- | -------------------------- |
| `vars` string               | object key       | `plain_text`               |
| `vars` JSON value           | object key       | `json`                     |
| `kv_namespaces`             | `binding`        | `kv_namespace`             |
| `durable_objects.bindings`  | `name`           | `durable_object_namespace` |
| `r2_buckets`                | `binding`        | `r2_bucket`                |
| `d1_databases`              | `binding`        | `d1`                       |
| `services`                  | `binding`        | `service`                  |
| `analytics_engine_datasets` | `binding`        | `analytics_engine`         |
| `ai`                        | `binding`        | `ai`                       |
| `browser`                   | `binding`        | `browser`                  |
| `images`                    | `binding`        | `images`                   |
| `vectorize`                 | `binding`        | `vectorize`                |
| `hyperdrive`                | `binding`        | `hyperdrive`               |
| `queues.producers`          | `binding`        | `queue`                    |
| `workflows`                 | `binding`        | `workflow`                 |
| `mtls_certificates`         | `binding`        | `mtls_certificate`         |
| `dispatch_namespaces`       | `binding`        | `dispatch_namespace`       |
| `pipelines`                 | `binding`        | `pipelines`                |
| `send_email`                | `name`           | `send_email`               |
| `version_metadata`          | `binding`        | `version_metadata`         |
| `assets.binding`            | `binding`        | `assets`                   |

Backing identifiers and names such as KV namespace IDs, D1 IDs, R2 bucket
names, service names, and queue names are deliberately discarded. `0.8.0`
proves the binding contract only: name plus type.

## Observability

Config Guard compares only explicitly declared values from this list:

- `observability.enabled`;
- `observability.head_sampling_rate`;
- `observability.logs.enabled`;
- `observability.logs.head_sampling_rate`;
- `observability.logs.invocation_logs`;
- `observability.logs.persist`;
- `observability.traces.enabled`;
- `observability.traces.head_sampling_rate`; and
- `observability.traces.persist`.

When Cloudflare does not return an explicitly declared field, the result is a
`WARNING`, not a false match or drift claim.

## Visible warnings

The first release reports, but does not compare, unsupported binding/config
families such as `unsafe`, legacy module blobs, rate-limit bindings, AI Search,
Web Search, Media, and Secrets Store declarations. Unsupported observability
properties, including destination lists, are also visible warnings.

Routes, domains, cron triggers, placement, migrations, limits, assets contents,
source code, and independent Cloudflare resources are out of scope.
