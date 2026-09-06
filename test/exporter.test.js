import test from 'node:test';
import assert from 'node:assert/strict';
import { handleExport } from '../src/lib/exporter.js';
import settings from './fixtures/dataset-settings.json' with { type: 'json' };

const zone = 'a'.repeat(32);
const env = { CF_API_TOKEN: 'private-cloudflare-token', EXPORT_API_KEY: 's'.repeat(48), CF_ALLOWED_ZONE_IDS: zone };
const now = Date.parse('2026-09-05T12:00:00Z');
const row = { dimensions: { date: '2026-09-01' }, sum: { requests: 42, bytes: 500 } };
const data = (rows = [row]) => ({ data: { viewer: { zones: [{ httpRequests1dGroups: rows }] } } });
function request(params = {}, options = {}) {
  return new Request(`https://export.test/api/cf-export?${new URLSearchParams({ zoneId: zone, from: '2026-09-01', to: '2026-09-03', ...params })}`, {
    headers: { Authorization: `Bearer ${env.EXPORT_API_KEY}` }, ...options,
  });
}
function run(req = request(), overrides = {}, bindings = env) {
  const fetchImpl = overrides.fetchImpl ?? (async () => Response.json(data()));
  return handleExport(req, bindings, { now, sleep: async () => {}, ...overrides,
    fetchImpl: async (url, options) => JSON.parse(options.body).query.includes('DatasetCapabilities')
      ? Response.json(settings) : fetchImpl(url, options),
  });
}
async function error(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).error.code, code);
}

test('successful JSON remains compatible, variables isolate user input', async () => {
  let sent;
  const response = await run(request(), { fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
    assert.equal(options.headers.Authorization, `Bearer ${env.CF_API_TOKEN}`);
    assert.ok(options.signal instanceof AbortSignal);
    sent = JSON.parse(options.body);
    return Response.json(data());
  } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [row]);
  assert.deepEqual(sent.variables, { zoneTag: zone, from: '2026-09-01', to: '2026-09-03' });
  assert.ok(!sent.query.includes(zone));
});

test('CSV is downloadable and uses only validated dates and numbers', async () => {
  const response = await run(request({ format: 'csv' }));
  assert.equal(response.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(response.headers.get('content-disposition'), /attachment; filename="cf_/);
  assert.equal(await response.text(), 'date,requests,bytes\r\n2026-09-01,42,500\r\n');
});

test('POST JSON works', async () => {
  const response = await run(request({}, { method: 'POST', headers: { Authorization: `Bearer ${env.EXPORT_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ zoneId: zone, from: '2026-09-01', to: '2026-09-03' }) }));
  assert.equal(response.status, 200);
});

test('default window ends at UTC midnight, custom end anchors default start', async () => {
  for (const [suffix, from, to] of [['', '2026-08-29', '2026-09-05'], ['&to=2026-09-02', '2026-08-26', '2026-09-02']]) {
    await run(new Request(`https://export.test/api/cf-export?zoneId=${zone}${suffix}`, { headers: { Authorization: `Bearer ${env.EXPORT_API_KEY}` } }), {
      fetchImpl: async (_, options) => { assert.deepEqual(JSON.parse(options.body).variables, { zoneTag: zone, from, to }); return Response.json(data([])); },
    });
  }
});

test('authentication and configuration fail before contacting upstream', async () => {
  const noFetch = { fetchImpl: () => { assert.fail('must not query Cloudflare'); } };
  await error(await run(request({}, { headers: {} }), noFetch), 401, 'UNAUTHORIZED');
  await error(await run(request({}, { headers: { Authorization: `Bearer ${'x'.repeat(48)}` } }), noFetch), 401, 'UNAUTHORIZED');
  for (const bindings of [{}, { ...env, EXPORT_API_KEY: 'short' }, { ...env, CF_ALLOWED_ZONE_IDS: '' }, { ...env, CF_ALLOWED_ZONE_IDS: 'invalid' }, { ...env, CF_API_TOKEN: '' }]) {
    await error(await run(request(), noFetch, bindings), 503, 'NOT_CONFIGURED');
  }
  await error(await run(request({ zoneId: 'b'.repeat(32) }), noFetch), 403, 'ZONE_FORBIDDEN');
});

for (const [label, params, code] of [
  ['injection', { zoneId: '" }) { settings { enabled } }' }, 'INVALID_ZONE'],
  ['timestamp', { from: '2026-09-01T00:00:00Z' }, 'INVALID_DATE'],
  ['impossible date', { from: '2026-02-30' }, 'INVALID_DATE'],
  ['reversed dates', { from: '2026-09-04' }, 'INVALID_RANGE'],
  ['empty interval', { from: '2026-09-03' }, 'INVALID_RANGE'],
  ['overlarge interval', { from: '2025-01-01' }, 'INVALID_RANGE'],
  ['future end', { to: '2026-09-06' }, 'INVALID_RANGE'],
  ['unsupported format', { format: 'xml' }, 'INVALID_FORMAT'],
  ['unknown parameter', { hostname: 'example.com' }, 'INVALID_INPUT'],
]) {
  test(`rejects ${label} before upstream access`, async () => {
    await error(await run(request(params), { fetchImpl: () => assert.fail('must not query') }), 400, code);
  });
}

test('duplicate query parameters rejected', async () => {
  const req = request();
  await error(await run(new Request(req.url + '&zoneId=' + zone, { headers: req.headers })), 400, 'INVALID_INPUT');
});

for (const body of ['{', 'null', '[]', '42', '{"zoneId":123}']) {
  test(`rejects malformed or non-object input ${body}`, async () => {
    const response = await run(request({}, { method: 'POST', headers: { Authorization: `Bearer ${env.EXPORT_API_KEY}`, 'Content-Type': 'application/json' }, body }));
    assert.equal(response.status, 400);
  });
}

test('method, media type and streaming body size restrictions', async () => {
  const method = await run(request({}, { method: 'DELETE' }));
  await error(method, 405, 'METHOD_NOT_ALLOWED');
  assert.equal(method.headers.get('allow'), 'GET, POST');
  await error(await run(request({}, { method: 'POST', body: '{}' })), 415, 'UNSUPPORTED_MEDIA_TYPE');
  const headers = { Authorization: `Bearer ${env.EXPORT_API_KEY}`, 'Content-Type': 'application/json' };
  await error(await run(request({}, { method: 'POST', headers, body: ' '.repeat(4097) })), 413, 'BODY_TOO_LARGE');
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(3000)); controller.enqueue(new Uint8Array(2000)); controller.close(); } });
  await error(await run(request({}, { method: 'POST', headers, body: stream, duplex: 'half' })), 413, 'BODY_TOO_LARGE');
});

test('HTTP failure cannot masquerade as an empty export; transient retries are bounded', async () => {
  let calls = 0;
  const response = await run(request(), { fetchImpl: async () => { calls++; return Response.json({ secret: env.CF_API_TOKEN }, { status: 503 }); } });
  await error(response, 503, 'UPSTREAM_HTTP_ERROR');
  assert.equal(calls, 2);
});

test('transient failure can recover; long Retry-After is respected without sleeping', async () => {
  let calls = 0;
  const response = await run(request(), { fetchImpl: async () => ++calls === 1 ? new Response('', { status: 502 }) : Response.json(data()) });
  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  calls = 0;
  const limited = await run(request(), { fetchImpl: async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '30' } }); }, sleep: () => assert.fail('must not sleep') });
  assert.equal(limited.headers.get('retry-after'), '30');
  await error(limited, 503, 'UPSTREAM_HTTP_ERROR');
  assert.equal(calls, 1);
});

test('HTTP 403 and GraphQL errors are sanitized and not retried', async () => {
  for (const reply of [() => Response.json({ token: env.CF_API_TOKEN }, { status: 403 }), () => Response.json({ ...data(), errors: [{ message: env.CF_API_TOKEN }] })]) {
    let calls = 0;
    const response = await run(request(), { fetchImpl: async () => { calls++; return reply(); } });
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes(env.CF_API_TOKEN));
    assert.equal(calls, 1);
  }
});

test('empty dataset is valid; missing zone/data and malformed payloads are not', async () => {
  const empty = await run(request(), { fetchImpl: async () => Response.json(data([])) });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), []);
  for (const payload of [null, {}, { data: { viewer: { zones: [] } } }, data([{ ...row, sum: { requests: -1, bytes: 50 } }]), data([row, row]), data([{ ...row, dimensions: { date: '2026-09-04' } }]), data([{ ...row, sum: { requests: 1, bytes: Number.MAX_SAFE_INTEGER + 1 } }])]) {
    await error(await run(request(), { fetchImpl: async () => Response.json(payload) }), 502, 'UPSTREAM_INVALID_RESPONSE');
  }
  await error(await run(request(), { fetchImpl: async () => new Response('<html>error</html>') }), 502, 'UPSTREAM_INVALID_RESPONSE');
});

test('result limit saturation is rejected', async () => {
  await error(await run(request(), { fetchImpl: async () => Response.json(data(Array(32).fill(row))) }), 502, 'UPSTREAM_TRUNCATED');
});

test('timeouts and network failures produce bounded sanitized errors', async () => {
  for (const [failure, status, code] of [[new DOMException('secret detail', 'TimeoutError'), 504, 'UPSTREAM_TIMEOUT'], [new TypeError('private detail'), 502, 'UPSTREAM_UNAVAILABLE']]) {
    let calls = 0;
    await error(await run(request(), { fetchImpl: async () => { calls++; throw failure; } }), status, code);
    assert.equal(calls, 2);
  }
});
