import assert from 'node:assert/strict';
import test from 'node:test';
import { loadSiteHealth } from '../src/lib/server/site-health.js';
import { DAY_MS, metricRows, reportCsv, reportWindows } from '../src/lib/site-health/report.js';

const zone = { id: 'a'.repeat(32), name: 'example.test' };
const now = new Date('2026-11-04T12:30:00Z');
const settings = {
  enabled: true,
  notOlderThan: 90 * 86_400,
  maxDuration: 3 * 86_400,
  maxPageSize: 1000,
  availableFields: [
    'sum_edgeResponseBytes',
    'dimensions_edgeResponseStatus',
    'dimensions_cacheStatus'
  ]
};
const payload = {
  traffic: [{ count: 100, sum: { edgeResponseBytes: 1000 } }],
  statuses: [
    { count: 70, dimensions: { edgeResponseStatus: 200 } },
    { count: 10, dimensions: { edgeResponseStatus: 302 } },
    { count: 5, dimensions: { edgeResponseStatus: 404 } },
    { count: 5, dimensions: { edgeResponseStatus: 522 } },
    { count: 10, dimensions: { edgeResponseStatus: 0 } }
  ],
  cache: [
    { count: 20, dimensions: { cacheStatus: 'HIT' } },
    { count: 80, dimensions: { cacheStatus: 'revalidated' } }
  ]
};

function mockAnalytics({ config = settings, windowResult = () => ({ data: payload }) } = {}) {
  const queries = [];
  const fetchImpl = async (url, options) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
    assert.equal(options.headers.Authorization, 'Bearer fake-token');
    const request = JSON.parse(options.body);
    assert.equal(request.variables.zoneTag, zone.id);
    queries.push(request);
    if (!request.variables.window) {
      return Response.json({
        data: { viewer: { zones: [{ settings: { httpRequestsAdaptiveGroups: config } }] } }
      });
    }
    const { data, errors } = windowResult(request.variables.window);
    return Response.json({ data: { viewer: { zones: [data] } }, errors });
  };
  return { fetchImpl, queries };
}

test('report windows are adjacent, equal and based on complete UTC days', () => {
  const { current, previous } = reportWindows(now);
  assert.equal(new Date(current.end).toISOString(), '2026-11-04T00:00:00.000Z');
  assert.equal(previous.end, current.start);
  assert.equal(current.end - current.start, 30 * DAY_MS);
  assert.equal(previous.end - previous.start, 30 * DAY_MS);
});

test('report reads bounded windows and groups actual edge statuses', async () => {
  const { fetchImpl, queries } = mockAnalytics();
  const report = await loadSiteHealth('fake-token', zone, { fetchImpl, now });
  assert.equal(queries.length, 21);
  assert.match(queries[1].query, /dimensions \{ edgeResponseStatus \}/);
  const windows = queries.slice(1).map(({ variables }) => variables.window);
  windows.sort((a, b) => a.datetime_geq.localeCompare(b.datetime_geq));
  assert.ok(
    windows.every(
      (window, index) =>
        window.requestSource === 'eyeball' &&
        Date.parse(window.datetime_lt) - Date.parse(window.datetime_geq) <= 3 * DAY_MS &&
        (index === 0 || windows[index - 1].datetime_lt === window.datetime_geq)
    )
  );
  assert.deepEqual(report.current.statusCounts, {
    '1xx': 0,
    '2xx': 700,
    '3xx': 100,
    '4xx': 50,
    '5xx': 50,
    Unknown: 100
  });
  assert.equal(report.current.metrics.requests, 1000);
  assert.equal(report.current.metrics.bytes, 10_000);
  assert.equal(report.current.metrics.cacheHitRate, 20);
  assert.equal(report.current.metrics.serverErrorRate, (50 / 900) * 100);
});

test('short retention leaves the prior window unavailable, without querying it', async () => {
  const { fetchImpl, queries } = mockAnalytics({
    config: { ...settings, notOlderThan: 31 * 86_400 }
  });
  const report = await loadSiteHealth('fake-token', zone, { fetchImpl, now });
  assert.equal(queries.length, 11);
  assert.match(report.previous.notes.traffic, /retention/);
  assert.equal(report.previous.statusCounts, null);
  assert.equal(metricRows(report)[0].change, null);
  assert.match(reportCsv(report), /"requests","","count","unavailable","Cloudflare retention/);
});

test('a failed or truncated grouped metric does not contaminate available metrics', async () => {
  const { fetchImpl } = mockAnalytics({
    config: { ...settings, maxPageSize: 5 },
    windowResult: () => ({
      data: payload,
      errors: [{ path: ['viewer', 'zones', 0, 'cache'], message: 'private upstream error' }]
    })
  });
  const report = await loadSiteHealth('fake-token', zone, { fetchImpl, now });
  assert.equal(report.current.metrics.requests, 1000);
  assert.equal(report.current.statusCounts, null);
  assert.equal(report.current.metrics.cacheHitRate, undefined);
  assert.doesNotMatch(reportCsv(report), /private upstream error/);
});

test('zero traffic is measured zero and an undefined rate remains blank', async () => {
  const { fetchImpl } = mockAnalytics({
    windowResult: () => ({
      data: { traffic: [], statuses: [], cache: [] }
    })
  });
  const report = await loadSiteHealth('fake-token', zone, { fetchImpl, now });
  assert.equal(report.current.metrics.requests, 0);
  assert.equal(report.current.statusCounts['5xx'], 0);
  assert.equal(report.current.metrics.serverErrorRate, null);
  assert.equal(metricRows(report)[0].change, 0);
  assert.match(reportCsv(report), /"requests",0,"count","potentially sampled"/);
});

test('CSV preserves the report snapshot, quotes strings and neutralizes formula text', () => {
  const report = {
    ...reportWindows(now),
    zone: { name: '=site"test' },
    generatedAt: now.toISOString()
  };
  report.current.metrics = { requests: 10, cacheHitRate: 90 };
  report.previous.metrics = { requests: 0, cacheHitRate: 85 };
  const rows = metricRows(report);
  assert.equal(rows[0].change, null);
  assert.equal(rows[2].change, 5);
  const csv = reportCsv(report);
  assert.match(csv, /"'=site""test","current","2026-10-05T00:00:00.000Z"/);
  assert.match(csv, /"requests",10,"count","potentially sampled"/);
  assert.ok(csv.endsWith('\r\n'));
});

test('invalid zone IDs, narrow query limits and unavailable settings fail safely', async () => {
  await assert.rejects(loadSiteHealth('fake-token', { ...zone, id: 'bad' }), /Invalid/);
  const { fetchImpl, queries } = mockAnalytics({ config: { ...settings, maxDuration: 86_400 } });
  const report = await loadSiteHealth('fake-token', zone, { fetchImpl, now });
  assert.equal(queries.length, 1);
  assert.match(report.current.notes.statuses, /too narrow/);
  const offline = await loadSiteHealth('fake-token', zone, {
    now,
    fetchImpl: async () => Response.json({ error: 'secret diagnostic' }, { status: 403 })
  });
  assert.match(offline.current.notes.statuses, /Zone Analytics Read/);
  assert.doesNotMatch(JSON.stringify(offline), /secret diagnostic/);
});
