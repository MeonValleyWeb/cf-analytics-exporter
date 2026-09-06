import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCapabilities, handleExport } from '../src/lib/exporter.js';
import fixture from './fixtures/dataset-settings.json' with { type: 'json' };

const zone = 'a'.repeat(32);
const env = { CF_API_TOKEN: 'private-token', EXPORT_API_KEY: 's'.repeat(48), CF_ALLOWED_ZONE_IDS: zone };
const now = Date.parse('2026-09-05T12:00:00Z');
function request(route = 'capabilities', params = {}, options = {}) {
  return new Request(`https://export.test/api/${route}?${new URLSearchParams({ zoneId: zone, ...params })}`, { headers: { Authorization: `Bearer ${env.EXPORT_API_KEY}` }, ...options });
}
function settings(overrides = {}) {
  const value = structuredClone(fixture);
  Object.assign(value.data.viewer.zones[0].settings.httpRequests1dGroups, overrides);
  return value;
}
const totals = (dates) => ({ data: { viewer: { zones: [{ httpRequests1dGroups: dates.map(date => ({ dimensions: { date }, sum: { requests: 1, bytes: 10 } })) }] } } });
async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal((await response.json()).error.code, code);
}
function dependencies(payload = settings(), collect = () => Response.json(totals([]))) {
  return { now, sleep: async () => {}, fetchImpl: async (_, options) => {
    const body = JSON.parse(options.body);
    return body.query.includes('DatasetCapabilities') ? Response.json(payload) : collect(body);
  } };
}

test('capabilities expose normalized live limits and conservative full-day retention', async () => {
  const response = await handleCapabilities(request(), env, dependencies(settings({ notOlderThan: 7 * 86400, maxDuration: 2 * 86400, maxPageSize: 1 })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.equal(result.earliestCompleteDay, '2026-08-30');
  assert.equal(result.latestExclusiveDay, '2026-09-05');
  assert.equal(result.maxWindowDays, 1);
  assert.equal(result.canExport, true);
  assert.equal(result.maxExportDays, 366);
});

test('capabilities route authorizes before discovery and validates method/input', async () => {
  const deps = { now, fetchImpl: () => assert.fail('no discovery expected') };
  await expectError(await handleCapabilities(request('capabilities', {}, { headers: {} }), env, deps), 401, 'UNAUTHORIZED');
  await expectError(await handleCapabilities(request('capabilities', { zoneId: 'b'.repeat(32) }), env, deps), 403, 'ZONE_FORBIDDEN');
  await expectError(await handleCapabilities(request('capabilities', { from: '2026-09-01' }), env, deps), 400, 'INVALID_INPUT');
  await expectError(await handleCapabilities(request('capabilities', {}, { method: 'POST' }), env, deps), 405, 'METHOD_NOT_ALLOWED');
});

test('disabled or missing fields prevent export without querying totals', async () => {
  for (const [limits, code] of [[{ enabled: false }, 'DATASET_UNAVAILABLE'], [{ availableFields: ['dimensions_date'] }, 'DATASET_FIELDS_UNAVAILABLE'], [{ maxNumberOfFields: 2 }, 'DATASET_FIELDS_UNAVAILABLE'], [{ maxDuration: 86399 }, 'DATASET_LIMITS_UNSUPPORTED'], [{ maxPageSize: 0 }, 'DATASET_LIMITS_UNSUPPORTED']]) {
    const deps = dependencies(settings(limits), () => assert.fail('no totals expected'));
    const capabilities = await handleCapabilities(request(), env, deps);
    assert.equal(capabilities.status, 200);
    assert.equal((await capabilities.json()).canExport, false);
    await expectError(await handleExport(request('cf-export'), env, deps), 422, code);
  }
});

test('missing/invalid settings never fall back to assumed entitlements', async () => {
  for (const payload of [{}, {data:{viewer:{zones:[]}}}, settings({ maxDuration: null }), settings({ maxPageSize: 1.5 }), settings({ notOlderThan: -1 }), settings({ availableFields: null })]) {
    await expectError(await handleCapabilities(request(), env, dependencies(payload)), 502, 'UPSTREAM_INVALID_SETTINGS');
  }
});

test('retention rejects the partially retained day and allows the first full day', async () => {
  const deps = dependencies(settings({ notOlderThan: 7 * 86400 }));
  await expectError(await handleExport(request('cf-export', { from: '2026-08-29', to: '2026-08-31' }), env, deps), 422, 'HISTORY_UNAVAILABLE');
  assert.equal((await handleExport(request('cf-export', { from: '2026-08-30', to: '2026-08-31' }), env, deps)).status, 200);
  const midnight = { ...deps, now: Date.parse('2026-09-05T00:00:00Z') };
  assert.equal((await handleExport(request('cf-export', { from: '2026-08-29', to: '2026-08-30' }), env, midnight)).status, 200);
});

test('date and page limits split into disjoint windows; full windows are not truncation', async () => {
  for (const limits of [{ maxDuration: 2 * 86400 }, { maxPageSize: 2 }]) {
    const calls = [];
    const deps = dependencies(settings(limits), (body) => {
      calls.push(body);
      const dates = [];
      for (let time = Date.parse(body.variables.from); time < Date.parse(body.variables.to); time += 86400000) dates.push(new Date(time).toISOString().slice(0,10));
      assert.match(body.query, new RegExp(`limit: ${dates.length},`));
      return Response.json(totals(dates.reverse()));
    });
    const response = await handleExport(request('cf-export', { from: '2026-08-31', to: '2026-09-05' }), env, deps);
    assert.equal(response.status, 200);
    assert.deepEqual(calls.map(({variables:{from,to}}) => [from,to]), [['2026-08-31','2026-09-02'],['2026-09-02','2026-09-04'],['2026-09-04','2026-09-05']]);
    assert.equal(response.headers.get('x-export-window-count'), '3');
    assert.equal(response.headers.get('x-export-missing-days'), '0');
    assert.deepEqual((await response.json()).map(row => row.dimensions.date), ['2026-08-31','2026-09-01','2026-09-02','2026-09-03','2026-09-04']);
  }
});

test('missing dates stay missing and are counted for JSON and CSV', async () => {
  for (const format of ['json', 'csv']) {
    const response = await handleExport(request('cf-export', { from: '2026-09-01', to: '2026-09-04', format }), env, dependencies(settings(), () => Response.json(totals(['2026-09-02']))));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-export-missing-days'), '2');
    assert.ok(!(await response.text()).includes('2026-09-01'));
  }
});

test('ranges beyond 31 days are supported, but excessive window counts are rejected first', async () => {
  const response = await handleExport(request('cf-export', { from: '2026-07-01', to: '2026-09-01' }), env, dependencies());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-export-window-count'), '2');
  await expectError(await handleExport(request('cf-export', { from: '2026-07-01', to: '2026-09-01' }), env, dependencies(settings({maxPageSize:1}), () => assert.fail('no data calls'))), 422, 'TOO_MANY_WINDOWS');
});

test('later-window failure discards the partial export', async () => {
  let calls = 0;
  const deps = dependencies(settings({ maxPageSize: 1 }), () => ++calls === 1 ? Response.json(totals(['2026-09-01'])) : Response.json({ errors: [{ message: 'private detail' }] }));
  const response = await handleExport(request('cf-export', { from: '2026-09-01', to: '2026-09-03' }), env, deps);
  await expectError(response, 502, 'UPSTREAM_GRAPHQL_ERROR');
  assert.equal(calls, 2);
});

test('operation deadline aborts discovery and prevents subsequent windows', async () => {
  const controller = new AbortController();
  controller.abort();
  await expectError(await handleCapabilities(request(), env, { now, signal:controller.signal, fetchImpl:()=>assert.fail('already expired') }), 504, 'EXPORT_TIMEOUT');
  const during = new AbortController();
  const deps = dependencies(settings({maxPageSize:1}), () => { during.abort(); return Response.json(totals(['2026-09-01'])); });
  await expectError(await handleExport(request('cf-export', {from:'2026-09-01',to:'2026-09-03'}), env, {...deps, signal:during.signal}), 504, 'EXPORT_TIMEOUT');
});
