import test from 'node:test';
import assert from 'node:assert/strict';
import { requireUser, sessionError } from '../src/lib/server/session.js';
import { ExportError } from '../src/lib/http.js';

const request = (origin) => new Request('https://analytics.example/api/cf-store-token', {
  method: 'POST', headers: origin ? { origin } : {},
  body: JSON.stringify({ userId: 'victim' }),
});

test('submitted user identity never establishes authentication', () => {
  for (const locals of [{}, { auth: () => ({ userId: 'victim', isAuthenticated: false }) }]) {
    assert.throws(() => requireUser(locals, request()), { status: 401 });
  }
});

test('verified identity takes precedence over submitted identity and rejects cross-origin writes', () => {
  const locals = { auth: () => ({ isAuthenticated: true, userId: 'verified-user' }) };
  assert.equal(requireUser(locals, request('https://analytics.example')), 'verified-user');
  assert.throws(() => requireUser(locals, request('https://attacker.example')), { status: 403 });
});

test('errors are non-cacheable and do not disclose internal credentials', async () => {
  const response = sessionError(new Error('secret upstream credentials'));
  assert.equal(response.status, 502);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!(await response.text()).includes('secret upstream credentials'));
  assert.equal(sessionError(new SyntaxError()).status, 400);
  assert.equal(sessionError(new ExportError(401, 'unauthorized', 'Sign in required.')).status, 401);
});
