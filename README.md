# CF Analytics Exporter

CF Analytics is an Astro application for viewing and exporting Cloudflare zone
analytics. Crawler Guard adds a read-only comparison of Cloudflare bot settings
and the public `robots.txt` served by each zone.

Current version: `0.7.0`

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

Crawler Guard provides evidence and exact manual remediation. It does not call a
Cloudflare mutation endpoint.

## Architecture

- **Framework:** Astro 7, React islands, Tailwind CSS 4.
- **Runtime:** Cloudflare Workers SSR via `@astrojs/cloudflare`.
- **Authentication:** Clerk middleware. Server routes derive the user from
  `locals.auth()` and never trust a browser-supplied user ID.
- **Persistence:** Supabase service-role access from server code only.
- **Token security:** Cloudflare tokens are encrypted with AES-256-GCM at rest
  and decrypted only for authenticated server-side Cloudflare requests.
- **Cloudflare data:** REST API for zones and bot configuration; GraphQL for
  analytics; public HTTPS request for each selected zone's `robots.txt`.

See [Crawler Guard architecture](docs/crawler-guard/architecture.md) for the
request flow and trust boundaries.

## Local setup

Install dependencies:

```sh
npm install
```

Copy `.env.example` to `.env` and provide:

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

## Cloudflare API token

The stored customer token should have:

- `Zone:Read` to enumerate zones and their account metadata;
- `Zone Analytics:Read` for the existing analytics dashboard; and
- `Bot Management:Read` for complete Crawler Guard configuration evidence.

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
- [Product roadmap](plan.md)
- [Changelog](CHANGELOG.md)
