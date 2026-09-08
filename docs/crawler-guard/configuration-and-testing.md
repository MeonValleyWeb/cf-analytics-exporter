# Crawler Guard configuration and testing

## Application environment

Crawler Guard uses the same server environment as the existing app:

| Variable                       | Purpose                                          |
| ------------------------------ | ------------------------------------------------ |
| `PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser initialization.                    |
| `CLERK_SECRET_KEY`             | Server-side Clerk authentication.                |
| `SUPABASE_URL`                 | Supabase project endpoint.                       |
| `SUPABASE_SERVICE_ROLE_KEY`    | Server-only access to the token table.           |
| `TOKEN_ENCRYPTION_KEY`         | 32-byte base64 AES-256-GCM token-encryption key. |

No new Worker binding or database migration is required for v0.7.0.

## Customer Cloudflare token

Recommended read permissions:

```text
Zone:Read
Zone Analytics:Read
Bot Management:Read
```

Use the narrowest zone resources appropriate to the customer. Crawler Guard can
only enumerate and scan zones included in the token's resources.

If `Bot Management:Read` is absent, the scan continues with public robots
evidence and shows Cloudflare enforcement as unknown. The token remains encrypted
at rest and is never returned to the browser.

## Automated tests

Run:

```sh
npm test
```

The credential-free suite covers:

- robots groups, specificity, `Allow`/`Disallow`, and Content Signals;
- Search, AI agent, AI training, managed-output, and mixed-purpose rules;
- dates before and after September 15, 2026;
- multi-page zone enumeration and account grouping;
- Bot Management success and missing-permission responses; and
- safe public robots retrieval, redirect handling, and response-size limits.

The adapters accept an injected `fetch` function. Tests return standard `Response`
objects and never call live Cloudflare endpoints.

## Full local verification

```sh
npm test
npm run lint
npm run format:check
npm run check
npm run build
```

Expected baseline note: the current lint configuration reports 13 existing
`no-explicit-any` warnings in the legacy dashboard/chart code. Crawler Guard adds
no new lint errors or warnings.

## Browser smoke check

1. Start `npm run dev`.
2. Open `/crawler-guard` while signed out.
3. Confirm redirect to `/sign-in?redirect_url=%2Fcrawler-guard`.
4. Sign in and confirm accounts and zones load.
5. Select a zone and run one scan.
6. Confirm the three visibility cards, managed robots status, September 15
   status, findings, and evidence panels render.
7. Confirm the browser network log contains only GET requests for zone listing,
   Crawler Guard, and normal page assets.

Steps 4-7 require a real local Clerk session and stored Cloudflare token and are
not part of credential-free CI.

## Live acceptance cases

Use test zones rather than changing production settings solely for testing:

- Bot Management config available and managed `robots.txt` disabled.
- Managed `robots.txt` enabled with the Cloudflare marker visible publicly.
- Token without Bot Management Read.
- Missing `robots.txt`.
- Explicit Search crawler block.
- Legacy `ai_bots_protection=block` before/after the September 15 boundary.

Record the scan time and evidence state. Do not mark a live case verified from a
build or mocked unit test alone.
