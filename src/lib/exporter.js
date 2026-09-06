import { authorizeScope } from './auth.js';
import { ExportError, fail, json } from './http.js';
import { requestGraphql } from './cloudflare-client.js';
import { discoverCapabilities, planWindows, MAX_DAYS } from './capabilities.js';

const DAY = 86_400_000;
const MAX_BODY = 4096;
const dailyQuery = (limit) => `query DailyTraffic($zoneTag: string!, $from: Date!, $to: Date!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(limit: ${limit}, filter: { date_geq: $from, date_lt: $to }, orderBy: [date_ASC]) {
        dimensions { date }
        sum { requests bytes }
      }
    }
  }
}`;

async function readInput(request) {
  if (request.method === 'GET') {
    const entries = [...new URL(request.url).searchParams];
    if (new Set(entries.map(([key]) => key)).size !== entries.length) {
      fail(400, 'INVALID_INPUT', 'Duplicate query parameters are not supported.');
    }
    return Object.fromEntries(entries);
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    fail(415, 'UNSUPPORTED_MEDIA_TYPE', 'POST requires application/json.');
  }
  const reader = request.body?.getReader();
  let body = '';
  let size = 0;
  const decoder = new TextDecoder();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY) {
          await reader.cancel();
          fail(413, 'BODY_TOO_LARGE', 'Request body exceeds 4096 bytes.');
        }
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } finally {
      reader.releaseLock();
    }
  }
  try {
    const input = JSON.parse(body);
    if (input === null || Array.isArray(input) || typeof input !== 'object') throw new Error();
    return input;
  } catch {
    fail(400, 'INVALID_JSON', 'Provide a JSON object.');
  }
}

function dateValue(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(400, 'INVALID_DATE', `${name} must use YYYY-MM-DD in UTC.`);
  }
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== value) {
    fail(400, 'INVALID_DATE', `${name} must be a real calendar date.`);
  }
  return ms;
}

function authorizedZone(value, zones) {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/i.test(value)) {
    fail(400, 'INVALID_ZONE', 'zoneId must be a 32-character hexadecimal identifier.');
  }
  const zoneId = value.toLowerCase();
  if (!zones.has(zoneId)) fail(403, 'ZONE_FORBIDDEN', 'This zone is not enabled for export.');
  return zoneId;
}

function parameters(input, zones, now) {
  if (Object.keys(input).some((key) => !['zoneId', 'from', 'to', 'format'].includes(key))) {
    fail(400, 'INVALID_INPUT', 'Supported parameters are zoneId, from, to and format.');
  }
  const zoneId = authorizedZone(input.zoneId, zones);
  const today = new Date(now).toISOString().slice(0, 10);
  const to = input.to ?? today;
  const end = dateValue(to, 'to');
  const from = input.from ?? new Date(end - 7 * DAY).toISOString().slice(0, 10);
  const start = dateValue(from, 'from');
  if (start >= end || end - start > MAX_DAYS * DAY || end > Date.parse(today)) {
    fail(400, 'INVALID_RANGE', 'Use 1–366 complete UTC days, with from inclusive and to exclusive; to cannot exceed today.');
  }
  const format = input.format ?? 'json';
  if (!['json', 'csv'].includes(format)) fail(400, 'INVALID_FORMAT', 'format must be json or csv.');
  return { zoneId, from, to, format };
}

async function queryDailyWindow(params, token, dependencies, limit) {
  // The numeric limit comes only from validated dataset settings and UTC window length.
  const query = dailyQuery(limit);
  const payload = await requestGraphql(query, { zoneTag: params.zoneId, from: params.from, to: params.to }, token, dependencies);
  const zones = payload.data?.viewer?.zones;
  if (!Array.isArray(zones) || zones.length !== 1 || !Array.isArray(zones[0]?.httpRequests1dGroups)) {
    fail(502, 'UPSTREAM_INVALID_RESPONSE', 'Cloudflare did not return the requested zone dataset.');
  }
  const groups = zones[0].httpRequests1dGroups;
  const seen = new Set();
  if (groups.length > limit) fail(502, 'UPSTREAM_TRUNCATED', 'Cloudflare returned an unexpectedly large result.');
  for (const group of groups) {
    const date = group?.dimensions?.date;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date ||
        date < params.from || date >= params.to || seen.has(date) ||
        ![group?.sum?.requests, group?.sum?.bytes].every((n) => Number.isSafeInteger(n) && n >= 0)) {
      fail(502, 'UPSTREAM_INVALID_RESPONSE', 'Cloudflare returned invalid daily totals.');
    }
    seen.add(date);
  }
  return groups.map(({ dimensions, sum }) => ({ dimensions: { date: dimensions.date }, sum: { requests: sum.requests, bytes: sum.bytes } }))
    .sort((a, b) => a.dimensions.date.localeCompare(b.dimensions.date));
}

export async function handleExport(request, env, {
  fetchImpl = fetch,
  now = Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  signal = AbortSignal.timeout(25_000),
} = {}) {
  try {
    if (!['GET', 'POST'].includes(request.method)) fail(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.', { Allow: 'GET, POST' });
    const zones = authorizeScope(request, env);
    const params = parameters(await readInput(request), zones, now);
    const dependencies = { fetchImpl, sleep, signal };
    const capabilities = await discoverCapabilities(params.zoneId, env.CF_API_TOKEN, now, dependencies);
    const windows = planWindows(params, capabilities);
    const groups = [];
    for (const window of windows) {
      groups.push(...await queryDailyWindow({ ...params, ...window }, env.CF_API_TOKEN, dependencies, window.days));
    }
    const expectedDays = (Date.parse(params.to) - Date.parse(params.from)) / DAY;
    const metadata = {
      'X-Export-Dataset': capabilities.dataset,
      'X-Export-Window-Count': String(windows.length),
      'X-Export-Missing-Days': String(expectedDays - groups.length),
    };
    if (params.format === 'csv') {
      const csv = ['date,requests,bytes', ...groups.map((group) => `${group.dimensions.date},${group.sum.requests},${group.sum.bytes}`)].join('\r\n') + '\r\n';
      return new Response(csv, { headers: {
        ...metadata,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="cf_${params.zoneId}_${params.from}_${params.to}.csv"`,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      } });
    }
    return json(groups, 200, metadata);
  } catch (error) {
    if (error instanceof ExportError) return json({ error: { code: error.code, message: error.message } }, error.status, error.headers);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'The exporter could not complete the request.' } }, 500);
  }
}

export async function handleCapabilities(request, env, {
  fetchImpl = fetch,
  now = Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  signal = AbortSignal.timeout(25_000),
} = {}) {
  try {
    if (request.method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET.', { Allow: 'GET' });
    const zones = authorizeScope(request, env);
    const input = await readInput(request);
    if (Object.keys(input).some((key) => key !== 'zoneId')) fail(400, 'INVALID_INPUT', 'Only zoneId is supported.');
    const zoneId = authorizedZone(input.zoneId, zones);
    return json(await discoverCapabilities(zoneId, env.CF_API_TOKEN, now, { fetchImpl, sleep, signal }));
  } catch (error) {
    if (error instanceof ExportError) return json({ error: { code: error.code, message: error.message } }, error.status, error.headers);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Could not discover dataset capabilities.' } }, 500);
  }
}
