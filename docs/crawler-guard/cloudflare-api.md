# Cloudflare API assumptions

Last reviewed: September 8, 2026.

## Zone and account enumeration

Crawler Guard reuses the stored bearer-token auth model. It calls
`GET /client/v4/zones` with `page` and `per_page=50` until `total_pages` is
reached or Cloudflare returns a short page.

The zone response contains an `account` object, so v0.7.0 derives the accessible
account list from the zones instead of requiring a second account-level token
permission. An account with no zone visible to the token cannot appear in this
derived list.

The adapter caps enumeration at 100 pages as a request-safety boundary. Exceeding
that boundary returns an error rather than silently presenting a partial list.

Official reference: [Cloudflare Zones API](https://developers.cloudflare.com/api/resources/zones/).

## Bot Management configuration

For the selected zone, Crawler Guard calls:

```text
GET /client/v4/zones/{zone_id}/bot_management
```

Cloudflare documents `Bot Management Read` or `Bot Management Write` as accepted
permissions. Crawler Guard only needs the read permission.

The normalized evidence uses documented response fields when present:

- `ai_bots_protection`;
- `bot_preference_sync_enabled`;
- `cf_robots_variant`;
- `content_bots_protection`;
- `crawler_protection`;
- `is_robots_txt_managed`;
- `sbfm_verified_bots`; and
- `stale_zone_configuration`.

Official reference: [Get Zone Bot Management Config](https://developers.cloudflare.com/api/resources/bot_management/methods/get/).

### Availability handling

- HTTP 401/403 becomes `permission_required`.
- HTTP 404 becomes `unsupported`.
- HTTP 429 becomes `rate_limited`.
- Invalid or other upstream responses become `unavailable`.

These conditions do not prevent the public `robots.txt` inspection. They do
prevent the app from claiming that Cloudflare enforcement is known.

## September 15, 2026 policy behavior

Cloudflare states that, on September 15, 2026:

- new-domain defaults allow Search while blocking Agent and Training on pages
  with ads; and
- configurations that block AI training, including the legacy **Block AI bots**
  option, also block mixed-purpose crawlers classified for Search and Training.

Official reference: [Cloudflare Block AI Bots](https://developers.cloudflare.com/bots/additional-configurations/block-ai-bots/).

The published Bot Management response currently documents the legacy
`ai_bots_protection` value but not separate Search, Agent, and Training policy
values. Crawler Guard therefore flags the legacy blocking value and directs the
user to review all three policies in the dashboard. It does not invent the new
policy values from the zone's age, plan, or legacy setting.

## Managed robots.txt

Cloudflare documents that managed `robots.txt` can be prepended to an existing
origin file and that the public file can include Content Signals for `search`,
`ai-input`, and `ai-train`. Cloudflare also notes that robots directives are
voluntary; enforcement requires bot controls such as AI Crawl Control.

Official references:

- [Cloudflare managed robots.txt](https://developers.cloudflare.com/bots/additional-configurations/managed-robots-txt/)
- [AI Crawl Control directives](https://developers.cloudflare.com/ai-crawl-control/features/track-robots-txt/)

Crawler Guard reads the public response because it is the crawler-visible output.
It does not attempt to reconstruct the origin-only file after Cloudflare merges
managed content.
