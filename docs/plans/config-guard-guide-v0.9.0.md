# Config Guard guide v0.9.0 implementation plan

Status: approved for implementation  
Milestone: `0.9.0`  
Target release: September 2026

## Outcome

Add a public, in-product Config Guard guide that takes a new user from no token
to a safe first drift check. The guide must explain the product without assuming
Cloudflare or Wrangler expertise and must never encourage broader permissions
than the read-only feature needs.

## Current-state audit

- `main` is clean and synchronized with `origin/main` at Config Guard `0.8.1`.
- The public homepage links directly to Cloudflare's generic token guide, while
  `/config-guard` and Settings contain only short permission notes.
- Existing detailed documentation is repository Markdown rather than an
  in-product route.
- The responsive header can accommodate one concise Guide entry and already
  becomes a horizontally scrollable navigation row on narrow screens.
- Cloudflare's official token documentation was reviewed on September 10, 2026.

## Information architecture

Create the public route `/docs/config-guard` with an editorial, task-led layout:

1. **Before you start** — account, Worker, Wrangler file, and permission
   checklist.
2. **Create the token** — dashboard path, custom-token choice, exact minimum and
   full-product permission sets, resource scope, summary review, one-time secret
   warning, and link to Cloudflare's current source.
3. **Prepare Wrangler** — supported filenames, named environments,
   `secrets.required`, and a metadata-only example.
4. **Connect and run** — save the token, choose file/environment/account, run
   the explicit check, and explain what leaves the browser.
5. **Read the result** — `PASS`, `WARNING`, and `DRIFT`, with representative
   examples and safe remediation sequence.
6. **Troubleshooting** — permissions, account visibility, Worker naming,
   generated configs, and incomplete observability evidence.
7. **Security boundary and next step** — read-only guarantee, no secret values,
   and CTA back to Config Guard.

## Visual assets

Use two synthetic screenshots from Cloudflare's official Create API token guide:

- the custom-token builder; and
- the token summary review screen.

Copy the downloaded assets into `public/docs/config-guard/` with stable names,
descriptive alt text, captions, source links, and a September 10, 2026 review
date. The screenshots contain no personal data or token values.

Because the official screenshot uses a DNS example, add a clear in-page
permission-row diagram showing Config Guard's exact read-only permissions:

- Zone / Zone / Read; and
- Account / Workers Scripts / Read.

Also add a browser-to-server trust-boundary diagram using semantic HTML and
Tailwind so it remains responsive, accessible, and editable without regenerating
an image.

## Product integration

- Add Guide to primary navigation.
- Link the Config Guard hero and Settings permission guidance to the guide.
- Point the homepage API-token CTA to the new internal guide.
- Keep the external Cloudflare source links available from the guide.
- Do not gate the guide behind Clerk; users need it before connecting a token.

## Accessibility and verification

- Use a single H1, hierarchical headings, descriptive link text, figure captions,
  useful alt text, keyboard-visible links, and no colour-only status meaning.
- Avoid fixed-width diagrams; verify at desktop and 390 px mobile widths.
- Check that official screenshot images load and retain their aspect ratio.
- Confirm `/docs/config-guard` is public and `/config-guard` remains protected.
- Run unit tests, formatting, lint, Astro checks, guarded production build, and
  browser console/route checks.

## Versioning and commits

Release as semantic milestone `0.9.0`.

1. `docs: plan Config Guard guide v0.9.0`
2. `feat: add Config Guard guide and visual assets`
3. `docs: release Config Guard guide v0.9.0`

Every logical stage updates `CHANGELOG.md`. Keep the completed milestone local
and committed until a separate push/deploy instruction.

## Sources

- [Create API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
- [API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Worker settings API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/get/)
- [Worker secret metadata API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/secrets/methods/list/)
