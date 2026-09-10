# CF Analytics Exporter

CF Analytics is an Astro application for viewing and exporting Cloudflare zone
analytics. Crawler Guard assesses crawler visibility, while Config Guard compares
local Wrangler intent with deployed Worker metadata.

Current version: `0.9.0`

## Features

- Clerk-authenticated, multi-user access.
- Encrypted Cloudflare API-token storage in Supabase.
- Account and zone enumeration across every page returned by Cloudflare.
- Traffic and cache analytics with CSV export.
- Plan-aware dashboard summaries.
- Read-only Crawler Guard assessments for:
  - conventional search crawlers;
  - AI search and user agents;
  - AI training crawlers;
  - managed `robots.txt` conflicts; and
  - Cloudflare's September 15, 2026 mixed-purpose crawler policy change.
- Read-only Config Guard comparisons for:
  - required and unexpected remote secret names;
  - missing, unexpected, and type-mismatched Worker bindings;
  - compatibility date and flags; and
  - explicitly declared observability settings where the API returns evidence.

Both guards provide evidence and exact manual remediation. Neither calls a
Cloudflare mutation endpoint.

New users can follow the public
[Config Guard setup and testing guide](https://cf-analytics-exporter.meon-valley-web.workers.dev/docs/config-guard)
for the exact Cloudflare token permissions, Wrangler preparation, privacy flow,
result meanings, and troubleshooting after the `0.9.0` deployment.

## Architecture

- **Framework:** Astro 7, React islands, Tailwind CSS 4.
- **Runtime:** Cloudflare Workers SSR via `@astrojs/cloudflare`.
- **Authentication:** Clerk middleware. Server routes derive the user from
  `locals.auth()` and never trust a browser-supplied user ID.
- **Persistence:** Supabase service-role access from server code only.
- **Token security:** Cloudflare tokens are encrypted with AES-256-GCM at rest
  and decrypted only for authenticated server-side Cloudflare requests.
- **Cloudflare data:** REST API for zones, bot configuration, Worker settings,
  and Worker secret names; GraphQL for analytics; public HTTPS request for each
  selected zone's `robots.txt`.
- **Config privacy:** Wrangler files are parsed in the browser. Only normalized
  names/types and supported runtime metadata are sent to the authenticated API.

See [Crawler Guard architecture](docs/crawler-guard/architecture.md) for the
zone assessment flow and [Config Guard architecture](docs/config-guard/architecture.md)
for the Worker drift flow.

## Local setup

Install dependencies:

```sh
npm install
```

Copy `.env.example` to `.dev.vars` and provide:

```text
PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
TOKEN_ENCRYPTION_KEY
```

`TOKEN_ENCRYPTION_KEY` must be a 32-byte base64 value. Generate one with:

```sh
openssl rand -base64 32
```

Start the local Worker-compatible development server:

```sh
npm run dev
```

The Cloudflare Vite runtime loads `.dev.vars` for local-only secrets. Server code
reads runtime bindings from `cloudflare:workers`; it does not use
`import.meta.env`, which would inline values into a production bundle.

Build a deployable bundle and run the local secret-value scan:

```sh
npm run build:deploy
```

Deploy with the same guarded build:

```sh
npm run deploy
```

## Cloudflare API token

The stored customer token should have:

- `Zone:Read` to enumerate zones and their account metadata;
- `Zone Analytics:Read` for the existing analytics dashboard; and
- `Bot Management:Read` for complete Crawler Guard configuration evidence; and
- `Workers Scripts Read` for Config Guard settings and secret-name evidence.

Crawler Guard still inspects the public `robots.txt` when Bot Management config
is unavailable, but it reports Cloudflare enforcement as unknown.

## Quality checks

```sh
npm test
npm run lint
npm run format:check
npm run check
npm run build
```

The test suite uses Node's built-in test runner and does not require live Clerk,
Supabase, or Cloudflare credentials.

## Documentation

- [Implementation plan](docs/plans/crawler-guard-v0.7.0.md)
- [Crawler Guard architecture](docs/crawler-guard/architecture.md)
- [Cloudflare API assumptions](docs/crawler-guard/cloudflare-api.md)
- [Crawler-risk rules](docs/crawler-guard/risk-rules.md)
- [Configuration and testing](docs/crawler-guard/configuration-and-testing.md)
- [v0.7.0 implementation summary](docs/crawler-guard/implementation-summary-v0.7.0.md)
- [Config Guard v0.8.0 plan](docs/plans/config-guard-v0.8.0.md)
- [Config Guard architecture](docs/config-guard/architecture.md)
- [Supported Config Guard fields](docs/config-guard/supported-fields.md)
- [Config Guard API assumptions](docs/config-guard/cloudflare-api.md)
- [Config Guard security and testing](docs/config-guard/security-and-testing.md)
- [Config Guard future phases](docs/config-guard/future-phases.md)
- [v0.8.0 implementation summary](docs/config-guard/implementation-summary-v0.8.0.md)
- [Config Guard guide v0.9.0 plan](docs/plans/config-guard-guide-v0.9.0.md)
- [Config Guard guide v0.9.0 summary](docs/config-guard/guide-implementation-summary-v0.9.0.md)
- [Product roadmap](plan.md)
- [Changelog](CHANGELOG.md)
