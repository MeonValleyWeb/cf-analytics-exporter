import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MAX_WRANGLER_CONFIG_BYTES,
  WranglerConfigError,
  parseWranglerConfig
} from '../src/lib/config-guard/wrangler-config.js';

const fixtureUrl = (name) => new URL(`./fixtures/config-guard/${name}`, import.meta.url);

test('JSONC parsing returns metadata only and applies named-environment inheritance', async () => {
  const source = await readFile(fixtureUrl('wrangler.jsonc'), 'utf8');
  const parsed = parseWranglerConfig('wrangler.jsonc', source);
  const [base, staging] = parsed.environments;

  assert.equal(parsed.format, 'jsonc');
  assert.equal(base.scriptName, 'example-worker');
  assert.equal(base.accountId, 'a'.repeat(32));
  assert.deepEqual(base.declared.secrets, ['API_KEY', 'DATABASE_URL']);
  assert.deepEqual(base.declared.bindings, [
    { name: 'AI', type: 'ai' },
    { name: 'CACHE', type: 'kv_namespace' },
    { name: 'FILES', type: 'r2_bucket' },
    { name: 'JSON_CONFIG', type: 'json' },
    { name: 'PUBLIC_MODE', type: 'plain_text' }
  ]);
  assert.equal(JSON.stringify(base).includes('production'), false);
  assert.equal(JSON.stringify(base).includes('private-id'), false);
  assert.equal(JSON.stringify(base).includes('private-bucket'), false);

  assert.equal(staging.scriptName, 'example-worker-staging');
  assert.equal(staging.declared.compatibilityDate, '2026-09-01');
  assert.deepEqual(staging.declared.compatibilityFlags, ['nodejs_compat']);
  assert.deepEqual(staging.declared.secrets, ['STAGING_KEY']);
  assert.deepEqual(staging.declared.bindings, [
    { name: 'DB', type: 'd1' },
    { name: 'PUBLIC_MODE', type: 'plain_text' }
  ]);
  assert.equal(
    staging.declared.bindings.some((binding) => binding.name === 'CACHE'),
    false
  );
});

test('TOML parsing supports explicit environment names and common bindings', async () => {
  const source = await readFile(fixtureUrl('wrangler.toml'), 'utf8');
  const parsed = parseWranglerConfig('/safe/path/wrangler.toml', source);
  const [base, production] = parsed.environments;

  assert.equal(parsed.format, 'toml');
  assert.equal(base.scriptName, 'toml-worker');
  assert.deepEqual(base.declared.secrets, ['TOKEN']);
  assert.deepEqual(base.declared.bindings, [
    { name: 'BACKEND', type: 'service' },
    { name: 'BROWSER', type: 'browser' }
  ]);
  assert.equal(JSON.stringify(base).includes('private-service-name'), false);

  assert.equal(production.scriptName, 'toml-worker-live');
  assert.deepEqual(production.declared.secrets, ['LIVE_TOKEN']);
  assert.deepEqual(production.declared.bindings, [{ name: 'JOBS', type: 'queue' }]);
  assert.deepEqual(production.declared.observability, { enabled: false });
});

test('Wrangler parsing rejects unsupported files, malformed input, and oversized input', () => {
  assert.throws(() => parseWranglerConfig('.env', 'TOKEN=value'), WranglerConfigError);
  assert.throws(() => parseWranglerConfig('wrangler.jsonc', '{ invalid'), /Invalid JSONC/);
  assert.throws(
    () =>
      parseWranglerConfig(
        'wrangler.json',
        `{"name":"worker","pad":"${'x'.repeat(MAX_WRANGLER_CONFIG_BYTES)}"}`
      ),
    /512 KiB/
  );
});

test('unsupported binding fields become visible declaration warnings', () => {
  const parsed = parseWranglerConfig(
    'wrangler.json',
    JSON.stringify({ name: 'worker', compatibility_date: '2026-09-01', unsafe: { bindings: [] } })
  );

  assert.match(parsed.environments[0].warnings[0], /unsafe bindings are not compared/);
});

test('required secret names are trimmed and unsupported observability fields are visible', () => {
  const parsed = parseWranglerConfig(
    'wrangler.json',
    JSON.stringify({
      name: 'worker',
      compatibility_date: '2026-09-01',
      secrets: { required: [' API_KEY '] },
      observability: {
        enabled: true,
        redact_query_string: true,
        logs: { enabled: true, redact_query_string: true }
      }
    })
  );
  const environment = parsed.environments[0];

  assert.deepEqual(environment.declared.secrets, ['API_KEY']);
  assert.equal(environment.warnings.length, 2);
  assert.match(environment.warnings[0], /observability.redact_query_string/);
  assert.match(environment.warnings[1], /observability.logs.redact_query_string/);
});
