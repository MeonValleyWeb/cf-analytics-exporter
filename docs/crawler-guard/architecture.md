# Crawler Guard architecture

## Scope

Crawler Guard is a read-only, on-demand assessment. A user selects one of the
zones visible to their stored Cloudflare token. The server collects two evidence
sources, applies deterministic rules, and returns the assessment to the browser.

```text
Browser
  -> Clerk-authenticated Astro API route
     -> encrypted token lookup in Supabase
     -> Cloudflare REST API (zones + Bot Management GET)
     -> https://<selected-zone>/robots.txt
     -> pure crawler-risk engine
  <- normalized evidence, findings, and manual remediation
```

No Crawler Guard route sends `POST`, `PUT`, `PATCH`, or `DELETE` requests to
Cloudflare.

## Components

### `src/lib/server/cloudflare-api.js`

Owns Cloudflare REST reads. It paginates the zone list, normalizes account and
plan metadata, retrieves the zone Bot Management configuration, and converts
expected permission/availability errors into explicit statuses.

The adapter accepts an injected `fetch` implementation for credential-free unit
tests. It never logs or returns the API token.

### `src/lib/server/robots-inspector.js`

Fetches `https://<zone>/robots.txt` only after the hostname came from the user's
Cloudflare zone list and passed hostname validation. It:

- rejects IP addresses, single-label names, paths, and malformed hosts;
- uses HTTPS;
- does not follow redirects;
- times out after 8 seconds;
- caps the body at 256 KiB; and
- returns a normalized retrieval state rather than failing the whole assessment.

The redirect restriction prevents an otherwise valid zone from redirecting the
server-side request to an unexpected destination. A redirected file is reported
with its `Location` for manual investigation.

### `src/lib/crawler-guard/risk-engine.js`

Has no network, authentication, or persistence dependencies. It parses crawler
groups and Content Signals, evaluates representative user agents at `/`, and
combines those results with documented Bot Management fields.

The engine receives the current date as input, keeping the September 15 policy
logic deterministic in tests.

### API routes

- `GET /api/cf-zones` returns all accessible normalized zones plus accounts
  derived from zone account metadata.
- `GET /api/crawler-guard?zoneId=<32-character-id>` verifies authentication,
  loads the stored token, confirms the requested zone belongs to that token,
  gathers evidence concurrently, and returns one assessment.

The browser never supplies a hostname to the scan endpoint. The server resolves
the hostname from the authenticated token's zone list, preventing arbitrary URL
fetching.

### Interface

`/crawler-guard` uses a React island inside the existing Astro layout. It groups
zones by account, initiates one explicit scan at a time, renders three visibility
lanes, and preserves the source evidence behind every result.

The interface has no automatic fix control. All remediation directs the user to
the relevant Cloudflare dashboard area or origin `robots.txt` file.

## Trust boundaries

- Clerk owns browser-to-server identity.
- Supabase stores encrypted tokens; its service-role key stays server-side.
- Only normalized zone/account data and read-only scan evidence cross back to the
  browser.
- `robots.txt` is public but untrusted text. It is size-capped, parsed without
  evaluation, and rendered as React text rather than HTML.
- Cloudflare API errors are normalized without returning request headers or
  tokens.

## Known boundaries

- The app stores one Cloudflare token per Clerk user, matching the existing auth
  model. Multiple saved Cloudflare connections are not part of v0.7.0.
- A scan assesses the apex zone hostname, not every DNS hostname in the zone.
- `robots.txt` is advisory. A result does not prove crawler compliance.
- Cloudflare's documented Bot Management read model does not expose separate
  Search, Agent, and Training policy values. The engine shows unknown or at-risk
  states instead of inferring undocumented settings.
- Live credential verification is manual and environment-specific.
