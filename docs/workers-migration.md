# Pages to Workers — 0.0.4

The production Pages project was `cf-analytics-exporter.pages.dev`, connected to GitHub `main`. The Workers target is `cf-analytics-exporter` in account `f9f62053eee17d952677a658532234a5` (Meon Valley Web). Source lives at the repository root.

## Runtime and deployment

- Node 24; `npm ci`, `npm test`, `npm run deploy:check`, then `npm run deploy`.
- Astro's Cloudflare adapter generates the Worker entry, assets configuration and Wrangler deployment redirect. Do not point Wrangler at a Pages `_worker.js` or commit generated `dist/`/`.wrangler/` files.
- Set dashboard secrets using `wrangler secret put`: `PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Use the same Clerk instance and Supabase database to preserve accounts and saved tokens. Never embed secret values in build scripts or committed config.
- Set machine API bindings separately: `CF_API_TOKEN`, `EXPORT_API_KEY`, `CF_ALLOWED_ZONE_IDS`, `CF_BILLING_API_TOKEN`, `CF_ALLOWED_ACCOUNT_IDS`. Missing configuration fails closed. Dashboard credentials do not implicitly authorize the machine API.
- No Astro session KV binding is needed: Clerk owns authentication and Astro sessions are disabled. Images pass through. Workers observability is enabled; application code must not log tokens or request bodies.
- For automated builds, use repository root, `npm ci && npm test && npm run build`, deploy command `npx wrangler deploy`. GitHub's existing Pages integration does not automatically become a Workers build integration.

## Verification and cutover

Check `/api/ping`, home, Clerk sign-in, protected-page redirects, and rejection of anonymous dashboard APIs on the workers.dev deployment. Then sign in normally, load a saved account, query a small known date range, and compare CSV/dashboard totals. Configure Clerk production-domain/OAuth settings when adding a custom hostname.

A `pages.dev` hostname cannot be assigned as a Worker's custom domain. The Worker uses its own workers.dev URL or a custom domain. Keep Pages available during validation; do not delete the project as part of code migration. After verification, disable automatic Pages builds and optionally configure redirects from the old site. Rollback can retain the old Pages URL or restore a previous Worker deployment with `wrangler rollback`.

Workers supports future scheduled ingestion, queues, D1/R2 persistence and workflows via explicit bindings and handlers. These are follow-up product features, not automatically provisioned by changing hosting. Assistant plugins and skills are separate from the runtime.

## Deployment record — 2026-09-06

Worker: https://cf-analytics-exporter.meon-valley-web.workers.dev

Version ID: `a8b5b22b-7905-4318-b802-6abb093127db`. The four dashboard bindings were copied from Pages into encrypted Worker secrets, including renaming the Clerk public-key binding. Existing Clerk keys are development-instance keys. Machine analytics/billing bindings were not present and remain unconfigured (503 by design). Pages remains available as a rollback target; its Git integration has not been changed.

55 tests and the build/upload dry run passed. Live health returned 200, dashboard redirected to sign-in, all four anonymous dashboard APIs returned 401, and machine APIs returned the expected configuration 503. Local Wrangler proxy requests intermittently failed with a connection-lost error; the deployed API checks passed. Signed-in token access and real analytics still need normal account verification.
