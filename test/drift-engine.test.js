import assert from 'node:assert/strict';
import test from 'node:test';

import { assessConfigDrift } from '../src/lib/config-guard/drift-engine.js';

const declared = {
  compatibilityDate: '2026-09-01',
  compatibilityFlags: ['nodejs_compat'],
  observability: { enabled: true, 'logs.enabled': true },
  secrets: ['API_KEY', 'DATABASE_URL'],
  bindings: [
    { name: 'CACHE', type: 'kv_namespace' },
    { name: 'DB', type: 'd1' }
  ]
};

test('drift engine returns PASS for matching supported metadata', () => {
  const result = assessConfigDrift({
    declared,
    deployed: {
      secrets: {
        status: 'available',
        secrets: [
          { name: 'API_KEY', type: 'secret_text' },
          { name: 'DATABASE_URL', type: 'secret_text' }
        ]
      },
      settings: {
        status: 'available',
        settings: {
          compatibilityDate: '2026-09-01',
          compatibilityFlags: ['nodejs_compat'],
          observability: { enabled: true, 'logs.enabled': true },
          bindings: [
            { name: 'CACHE', type: 'kv_namespace' },
            { name: 'DB', type: 'd1' }
          ]
        }
      }
    }
  });

  assert.deepEqual(result, {
    status: 'PASS',
    summary: { drift: 0, warnings: 0, passed: true },
    differences: []
  });
});

test('drift engine reports every secret, binding, runtime, and observability difference', () => {
  const result = assessConfigDrift({
    declared,
    deployed: {
      secrets: {
        status: 'available',
        secrets: [
          { name: 'API_KEY', type: 'secret_text', text: 'must-never-appear' },
          { name: 'OLD_TOKEN', type: 'secret_text', text: 'must-never-appear' }
        ]
      },
      settings: {
        status: 'available',
        settings: {
          compatibilityDate: '2026-08-01',
          compatibilityFlags: ['nodejs_compat_v2'],
          observability: { enabled: false, 'logs.enabled': true },
          bindings: [
            { name: 'CACHE', type: 'r2_bucket' },
            { name: 'EXTRA', type: 'service' }
          ]
        }
      }
    }
  });

  assert.equal(result.status, 'DRIFT');
  assert.equal(result.summary.drift, 8);
  assert.deepEqual(
    result.differences.map((item) => item.id),
    [
      'binding-missing:DB',
      'binding-type:CACHE',
      'binding-unexpected:EXTRA',
      'observability-mismatch:enabled',
      'compatibility-date',
      'compatibility-flags',
      'secret-missing:DATABASE_URL',
      'secret-unexpected:OLD_TOKEN'
    ]
  );
  assert.equal(JSON.stringify(result).includes('must-never-appear'), false);
});

test('unavailable remote evidence and unsupported declarations return WARNING', () => {
  const result = assessConfigDrift({
    declared,
    declarationWarnings: ['unsafe bindings are not compared in Config Guard 0.8.0.'],
    deployed: {
      secrets: { status: 'permission_required', message: 'Permission required.' },
      settings: { status: 'rate_limited', message: 'Try again later.' }
    }
  });

  assert.equal(result.status, 'WARNING');
  assert.equal(result.summary.warnings, 3);
  assert.equal(
    result.differences.every((item) => item.status === 'WARNING'),
    true
  );
});

test('missing observability response field is WARNING while other drift remains visible', () => {
  const result = assessConfigDrift({
    declared,
    deployed: {
      secrets: { status: 'available', secrets: declared.secrets.map((name) => ({ name })) },
      settings: {
        status: 'available',
        settings: {
          compatibilityDate: declared.compatibilityDate,
          compatibilityFlags: declared.compatibilityFlags,
          observability: { enabled: true },
          bindings: declared.bindings
        }
      }
    }
  });

  assert.equal(result.status, 'WARNING');
  assert.equal(result.differences[0].id, 'observability-unavailable:logs.enabled');
});
