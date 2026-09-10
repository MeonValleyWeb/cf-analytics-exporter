import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ConfigGuardRequestError,
  validateConfigGuardRequest
} from '../src/lib/config-guard/request-validation.js';

const validPayload = {
  accountId: 'a'.repeat(32),
  scriptName: 'example-worker-production',
  declared: {
    compatibilityDate: '2026-09-01',
    compatibilityFlags: ['nodejs_compat'],
    observability: { enabled: true, 'logs.head_sampling_rate': 0.5 },
    secrets: ['API_KEY'],
    bindings: [{ name: 'CACHE', type: 'kv_namespace' }]
  },
  declarationWarnings: []
};

test('Config Guard request validation returns a bounded metadata-only payload', () => {
  assert.deepEqual(validateConfigGuardRequest(validPayload), validPayload);
});

test('Config Guard request validation rejects identifiers, duplicate bindings, and values', () => {
  assert.throws(
    () => validateConfigGuardRequest({ ...validPayload, accountId: '../account' }),
    ConfigGuardRequestError
  );
  assert.throws(
    () =>
      validateConfigGuardRequest({
        ...validPayload,
        declared: {
          ...validPayload.declared,
          bindings: [
            { name: 'CACHE', type: 'kv_namespace' },
            { name: 'CACHE', type: 'r2_bucket' }
          ]
        }
      }),
    /duplicate name/
  );
  assert.throws(
    () =>
      validateConfigGuardRequest({
        ...validPayload,
        declared: {
          ...validPayload.declared,
          bindings: [{ name: 'CACHE', type: 'kv_namespace', value: 'not accepted' }]
        }
      }),
    /unsupported field/
  );
});

test('Config Guard request validation rejects invalid observability rates', () => {
  assert.throws(
    () =>
      validateConfigGuardRequest({
        ...validPayload,
        declared: {
          ...validPayload.declared,
          observability: { head_sampling_rate: 2 }
        }
      }),
    /between 0 and 1/
  );
});

test('Config Guard request validation rejects calendar-invalid dates', () => {
  assert.throws(
    () =>
      validateConfigGuardRequest({
        ...validPayload,
        declared: { ...validPayload.declared, compatibilityDate: '2026-02-31' }
      }),
    /YYYY-MM-DD/
  );
});
