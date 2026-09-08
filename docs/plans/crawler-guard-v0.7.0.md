# Crawler Guard v0.7.0 implementation plan

Status: approved for implementation  
Milestone: `0.7.0`  
Target release: September 2026

## Outcome

Add a read-only Crawler Guard to CF Analytics. A signed-in user can enumerate the
accounts and zones visible to their existing Cloudflare API token, select a zone,
and receive a crawler-visibility assessment without CF Analytics changing any
Cloudflare setting.

The assessment covers:

- conventional search crawlers;
- AI search and user-agent access;
- AI training crawlers;
- Cloudflare-managed `robots.txt` conflicts;
- the mixed-purpose crawler behavior that Cloudflare says changes on September
  15, 2026; and
- exact, manual remediation guidance for each finding.

## Current architecture

- Astro 7 renders the application in SSR mode on Cloudflare Workers.
- Clerk middleware authenticates every request. API routes derive `userId` from
  `locals.auth()` and never accept a client-provided user identifier.
- A Supabase service-role client stores one Cloudflare API token per Clerk user.
  Tokens are encrypted with AES-256-GCM and decrypted only in server code.
- `/api/cf-zones` currently lists the first 50 zones available to that token.
- The dashboard and settings page reuse `AccountConnection.tsx` for token and
  zone selection.
- No automated test runner is currently configured; CI runs lint, formatting,
  Astro type checks, and the production build.

## Design

### 1. Shared Cloudflare read adapter

Create a server-only adapter that accepts an injected `fetch` implementation so
it can be unit tested without credentials. It will:

- list every accessible zone using Cloudflare REST pagination;
- retain the account ID and account name returned with each zone;
- retrieve `GET /zones/{zone_id}/bot_management`;
- distinguish missing permission, unsupported/unavailable configuration, rate
  limiting, and general upstream failures; and
- never expose the stored Cloudflare token to browser code or logs.

Update `/api/cf-zones` to use the adapter and return both flat zones and accounts
grouped from the zone response. This preserves the existing `zones` response
shape while extending it with account metadata.

### 2. Public robots.txt inspection

Create a bounded server-side inspector for `https://<zone>/robots.txt` that:

- only accepts a validated hostname obtained from the authenticated user's
  Cloudflare zone list;
- uses HTTPS, does not follow cross-origin redirects, applies a timeout, and
  rejects oversized responses;
- records response status, content type, retrieval time, and a capped body; and
- reports missing, blocked, redirected, oversized, and network-failure states
  without failing the entire zone assessment.

### 3. Pure risk engine

Create a dependency-free module that parses relevant `robots.txt` groups and
Cloudflare Content Signals, then returns deterministic findings and visibility
states. The engine will combine public directives with the fields documented on
the Bot Management response:

- `ai_bots_protection`;
- `is_robots_txt_managed`;
- `bot_preference_sync_enabled`;
- `cf_robots_variant`;
- `content_bots_protection`;
- `crawler_protection`; and
- verified-bot settings where present.

The engine must preserve uncertainty. Cloudflare's documented read response does
not currently expose separate Search, Agent, and Training policy values, so the
assessment must not invent them. It will show `unknown` or `at-risk` when the
available bot configuration and `robots.txt` cannot prove an effective allow or
block state.

Risk results use four severities (`critical`, `warning`, `info`, `pass`) and
visibility values (`allowed`, `blocked`, `partial`, `unknown`). Every non-pass
finding includes a manual remediation instruction and Cloudflare dashboard area.

### 4. Authenticated assessment endpoint

Add `GET /api/crawler-guard?zoneId=<id>`:

1. Require Clerk authentication.
2. Load the user's encrypted Cloudflare token server-side.
3. Validate the zone ID and confirm it appears in the token's zone list.
4. Fetch bot-management configuration and public `robots.txt` concurrently.
5. Return the normalized source evidence, visibility summary, findings, and scan
   timestamp.

Only `GET` calls are in scope. No Cloudflare mutation endpoint will be added.

### 5. Crawler Guard interface

Add `/crawler-guard` and a primary navigation entry. The page will:

- load accounts and zones through the existing authenticated zone endpoint;
- group zones by account;
- scan one selected zone at a time to keep API use explicit and bounded;
- show summary cards for Search, AI search/agents, and AI training;
- call out managed `robots.txt` and September 15 mixed-crawler risks;
- expose the evidence and retrieval limitations behind each result; and
- present manual remediation steps without an apply/fix control.

### 6. Tests and verification

Use Node's built-in test runner to avoid adding a test framework dependency.
Cover:

- robots group and Content Signal parsing;
- search, AI-agent, training, managed-conflict, and mixed-purpose risk rules;
- pre- and post-September 15 behavior;
- zone pagination and account normalization;
- bot-management success and permission/unavailable responses; and
- robots response size, redirect, and timeout/error handling where practical.

Run `npm test`, lint, format check, Astro type checks, and a production build.
Perform an unauthenticated route smoke check and a visual browser check of the
signed-out page. Live Cloudflare behavior remains unverified until a signed-in
user scans with a token that has `Zone:Read`, `Zone Analytics:Read`, and `Bot
Management:Read` permissions.

## Documentation and release tracking

- Add architecture, Cloudflare API assumptions, risk-rule, configuration, and
  testing documents under `docs/crawler-guard/`.
- Update the README, project roadmap, repository guidance, and CHANGELOG.
- Release as semantic milestone `0.7.0`; update both `package.json` and
  `package-lock.json`.
- Leave `docs/crawler-guard/implementation-summary-v0.7.0.md` with delivered
  scope, commit map, verification evidence, and explicitly deferred work.

## Commit plan

1. `docs: plan Crawler Guard v0.7.0`
2. `chore: ignore generated Supabase CLI state`
3. `feat: add Crawler Guard audit engine and API`
4. `feat: add Crawler Guard interface`
5. `docs: release Crawler Guard v0.7.0`

Each logical commit updates `CHANGELOG.md`. Existing user work and unrelated
source files will not be rewritten.

## Out of scope

- Changing Cloudflare settings or writing WAF/custom rules.
- Crawl-traffic analytics, historical violations, or scheduled scanning.
- Testing with a live customer token in CI.
- Claiming that `robots.txt` directives technically enforce crawler behavior.
- Inferring undocumented per-purpose Cloudflare policy values.
