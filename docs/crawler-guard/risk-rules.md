# Crawler-risk rules

## Interpretation model

Crawler Guard evaluates the root path `/` for representative user agents. It
applies the most specific matching `User-agent` group and the longest matching
`Allow` or `Disallow` rule; `Allow` wins an equal-length tie.

The three visibility lanes are:

| Lane                 | Representative user agents                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------- |
| Search               | Googlebot, Bingbot, Applebot                                                                 |
| AI search and agents | ChatGPT-User, Claude-User, PerplexityBot                                                     |
| AI training          | GPTBot, Google-Extended, Applebot-Extended, CCBot, ClaudeBot, meta-externalagent, Bytespider |

The list is intentionally explicit and versioned. It is a useful sample, not a
claim to cover every crawler Cloudflare classifies.

## Visibility values

| Value     | Meaning                                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `allowed` | Every representative crawler is allowed at `/` by the inspected evidence.                                                                     |
| `blocked` | Every representative crawler is blocked, or a Cloudflare control explicitly blocks the whole relevant set.                                    |
| `partial` | The representative crawlers differ, blocking is limited to ad pages, or a mixed-purpose policy can change an otherwise allowed Search result. |
| `unknown` | The required evidence could not be fetched or the documented API does not expose it.                                                          |

An `allowed` robots result means allowed by the published directives. It does not
prove that a WAF rule, Bot Management setting, origin rule, or crawler operator
will behave the same way.

## Finding severities

| Condition                                                           | Severity                               | Reason                                                                                   |
| ------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------- |
| Search crawler blocked at `/`                                       | Critical                               | Can remove conventional search visibility.                                               |
| Verified bots set to block                                          | Critical                               | Can block legitimate verified search crawlers at Cloudflare's edge.                      |
| Legacy AI block exposes mixed-purpose policy impact                 | Critical                               | Search behavior can differ from the apparent training-only intent on/after September 15. |
| `robots.txt` blocked, redirected, oversized, timed out, or errored  | Critical                               | Published crawler preferences cannot be established.                                     |
| `robots.txt` missing                                                | Warning                                | Crawlers receive no site-authored root directives.                                       |
| AI agent/training crawler blocked or partially blocked              | Warning                                | Material access state requiring an explicit product/content decision.                    |
| Managed flag and public marker disagree                             | Warning                                | The public output does not match the Cloudflare configuration evidence.                  |
| Bot Preference Sync enabled but Content Signals absent              | Warning                                | Expected synchronized preference evidence is not visible.                                |
| Content Signal says `yes` while representative crawlers are blocked | Critical for Search; warning otherwise | The stated content-use preference conflicts with access directives.                      |
| Bot configuration unavailable                                       | Warning                                | Cloudflare enforcement remains unknown.                                                  |
| AI training appears allowed                                         | Info                                   | Exposure worth reviewing, but not automatically an error.                                |
| No critical/warning finding                                         | Pass                                   | Available evidence shows no high-risk conflict.                                          |

## September 15 rule

When `ai_bots_protection` is `block` or `only_on_ad_pages`, the assessment records
a mixed-purpose risk. Before September 15, 2026 it includes the remaining whole
days; on and after the date it reports the behavior as active.

The Search lane becomes `partial` rather than `blocked` because the documented
legacy field does not identify which mixed-purpose crawlers affect that zone.
Training becomes `blocked` for `block` and `partial` for `only_on_ad_pages`.

## Managed robots conflicts

Two conflicts are currently deterministic:

1. Cloudflare reports `is_robots_txt_managed=true`, the public file is available,
   but the Cloudflare managed-content marker is absent.
2. Cloudflare reports `bot_preference_sync_enabled=true`, but the public file has
   none of `search`, `ai-input`, or `ai-train` in a Content Signal.

Crawler Guard also flags a signal/access conflict when a Content Signal says
`yes` but representative user-agent directives block the same lane.

## Remediation contract

Every critical, warning, and informational finding includes a manual action. The
guidance names the relevant `robots.txt` group or Cloudflare dashboard area. The
application intentionally does not offer an Apply button in v0.7.0.
