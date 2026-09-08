import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessCrawlerRisk,
  evaluateCrawlerAccess,
  parseRobotsTxt
} from '../src/lib/crawler-guard/risk-engine.js';

const zone = {
  id: 'a'.repeat(32),
  name: 'example.com',
  account: { id: 'account', name: 'Example' },
  plan: { name: 'Free Website', isPaid: false }
};

function scan({ body, config = {}, now = '2026-09-08T12:00:00Z', botStatus = 'available' }) {
  return assessCrawlerRisk({
    zone,
    botManagement:
      botStatus === 'available'
        ? { status: 'available', config }
        : { status: botStatus, message: 'Not available' },
    robots: { status: 'available', body },
    now: new Date(now)
  });
}

test('parseRobotsTxt handles specific groups and Content Signals', () => {
  const parsed = parseRobotsTxt(`
    # BEGIN Cloudflare Managed content
    User-agent: *
    Content-signal: search=yes, ai-input=yes, ai-train=no
    Allow: /

    User-agent: GPTBot
    Disallow: /
  `);

  assert.equal(parsed.hasCloudflareManagedMarker, true);
  assert.deepEqual(parsed.contentSignals, {
    search: 'yes',
    'ai-input': 'yes',
    'ai-train': 'no'
  });
  assert.equal(evaluateCrawlerAccess(parsed, 'Googlebot').state, 'allowed');
  assert.equal(evaluateCrawlerAccess(parsed, 'GPTBot').state, 'blocked');
});

test('specific allow overrides a wildcard block for search crawlers', () => {
  const parsed = parseRobotsTxt(`
    User-agent: *
    Disallow: /
    User-agent: Googlebot
    Allow: /
  `);

  assert.equal(evaluateCrawlerAccess(parsed, 'Googlebot').state, 'allowed');
  assert.equal(evaluateCrawlerAccess(parsed, 'Bingbot').state, 'blocked');
});

test('risk engine reports partial search visibility and signal conflict', () => {
  const result = scan({
    body: `
      User-agent: *
      Content-signal: search=yes
      Allow: /
      User-agent: Googlebot
      Disallow: /
    `
  });

  assert.equal(result.visibility.search.state, 'partial');
  assert.ok(result.findings.some((finding) => finding.id === 'search-robots-block'));
  assert.ok(result.findings.some((finding) => finding.id === 'search-signal-conflict'));
});

test('risk engine flags managed robots output conflicts', () => {
  const result = scan({
    body: 'User-agent: *\nAllow: /',
    config: { is_robots_txt_managed: true, bot_preference_sync_enabled: true }
  });

  assert.equal(result.managedRobots.conflict, true);
  assert.ok(result.findings.some((finding) => finding.id === 'managed-robots-marker-missing'));
  assert.ok(result.findings.some((finding) => finding.id === 'preference-sync-signals-missing'));
});

test('legacy AI blocking marks mixed-purpose policy risk before September 15', () => {
  const result = scan({
    body: 'User-agent: *\nAllow: /',
    config: { ai_bots_protection: 'block' }
  });

  assert.equal(result.policyChange.phase, 'upcoming');
  assert.equal(result.policyChange.daysUntil, 7);
  assert.equal(result.policyChange.state, 'risk');
  assert.equal(result.visibility.search.state, 'partial');
  assert.equal(result.visibility.aiTraining.state, 'blocked');
  assert.ok(result.findings.some((finding) => finding.id === 'mixed-purpose-policy-change'));
});

test('legacy AI blocking remains a visible active risk after September 15', () => {
  const result = scan({
    body: 'User-agent: *\nAllow: /',
    config: { ai_bots_protection: 'only_on_ad_pages' },
    now: '2026-09-16T12:00:00Z'
  });

  assert.equal(result.policyChange.phase, 'active');
  assert.equal(result.policyChange.daysUntil, 0);
  assert.equal(result.visibility.aiTraining.state, 'partial');
  assert.match(
    result.findings.find((finding) => finding.id === 'mixed-purpose-policy-change').title,
    /now active/
  );
});

test('missing Bot Management permission preserves an unknown enforcement state', () => {
  const result = scan({
    body: 'User-agent: *\nAllow: /',
    botStatus: 'permission_required'
  });

  assert.equal(result.policyChange.state, 'unknown');
  assert.ok(result.findings.some((finding) => finding.id === 'bot-config-unavailable'));
});
