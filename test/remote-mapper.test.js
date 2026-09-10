import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeWorkerSecrets,
  normalizeWorkerSettings
} from '../src/lib/config-guard/remote-mapper.js';

test('Worker settings mapper returns supported metadata without binding values', () => {
  const result = normalizeWorkerSettings({
    compatibility_date: '2026-09-01T00:00:00Z',
    compatibility_flags: ['nodejs_compat', 'nodejs_compat'],
    bindings: [
      { name: 'PUBLIC_MODE', type: 'plain_text', text: 'must-never-appear' },
      { name: 'API_KEY', type: 'secret_text', text: 'must-never-appear' },
      { name: 'CACHE', type: 'kv_namespace', namespace_id: 'private-id' }
    ],
    observability: {
      enabled: true,
      head_sampling_rate: 0.5,
      logs: { enabled: true, invocation_logs: false, destinations: ['private'] },
      traces: { enabled: false, propagation_policy: 'authenticated' }
    },
    routes: [{ pattern: 'private.example/*' }]
  });

  assert.deepEqual(result, {
    compatibilityDate: '2026-09-01',
    compatibilityFlags: ['nodejs_compat'],
    observability: {
      enabled: true,
      head_sampling_rate: 0.5,
      'logs.enabled': true,
      'logs.invocation_logs': false,
      'traces.enabled': false,
      'traces.propagation_policy': 'authenticated'
    },
    bindings: [
      { name: 'CACHE', type: 'kv_namespace' },
      { name: 'PUBLIC_MODE', type: 'plain_text' }
    ]
  });
  assert.equal(JSON.stringify(result).includes('must-never-appear'), false);
  assert.equal(JSON.stringify(result).includes('private-id'), false);
  assert.equal(JSON.stringify(result).includes('private.example'), false);
});

test('Worker secrets mapper strips values and deduplicates names', () => {
  const result = normalizeWorkerSecrets([
    { name: 'API_KEY', type: 'secret_text', text: 'must-never-appear' },
    { name: 'API_KEY', type: 'secret_text' },
    { name: 'SIGNING_KEY', type: 'secret_key', key_base64: 'must-never-appear' }
  ]);

  assert.deepEqual(result, [
    { name: 'API_KEY', type: 'secret_text' },
    { name: 'SIGNING_KEY', type: 'secret_key' }
  ]);
  assert.equal(JSON.stringify(result).includes('must-never-appear'), false);
});
