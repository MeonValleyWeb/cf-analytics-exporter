import { DAY_MS, STATUS_FAMILIES, ratio, reportWindows } from '../site-health/report.js';

const ENDPOINT = 'https://api.cloudflare.com/client/v4/graphql';
const MAX_CHUNKS_PER_PERIOD = 15;
const ZONE_ID = /^[a-f0-9]{32}$/i;
const GROUP_FIELDS = {
  traffic: 'count sum { edgeResponseBytes }',
  statuses: 'count dimensions { edgeResponseStatus }',
  cache: 'count dimensions { cacheStatus }'
};
const REQUIRED_FIELDS = {
  traffic: 'sum_edgeResponseBytes',
  statuses: 'dimensions_edgeResponseStatus',
  cache: 'dimensions_cacheStatus'
};
const SETTINGS_QUERY = `query SiteHealthSettings($zoneTag: string!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      settings {
        httpRequestsAdaptiveGroups {
          enabled availableFields notOlderThan maxDuration maxPageSize
        }
      }
    }
  }
}`;

async function queryZone(apiToken, query, variables, fetchImpl, signal) {
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    redirect: 'error',
    signal
  });
  if (!response.ok) throw new Error('Cloudflare analytics request failed.');
  const result = await response.json();
  return { data: result.data?.viewer?.zones?.[0], errors: result.errors ?? [] };
}

function groupQuery(sources) {
  const fields = Object.keys(sources).map(
    (name) =>
      `${name}: httpRequestsAdaptiveGroups(filter: $window, limit: ${sources[name]}) {
      ${GROUP_FIELDS[name]}
    }`
  );
  return `query SiteHealthWindow($zoneTag: string!, $window: ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!) {
    viewer { zones(filter: { zoneTag: $zoneTag }) { ${fields.join('\n')} } }
  }`;
}

function isCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function readGroups(rows, limit, source) {
  if (!Array.isArray(rows) || !rows.every((row) => isCount(row?.count))) return null;
  if (source === 'traffic') {
    if (rows.length > 1 || !rows.every((row) => isCount(row.sum?.edgeResponseBytes))) {
      return null;
    }
    return { requests: rows[0]?.count ?? 0, bytes: rows[0]?.sum.edgeResponseBytes ?? 0 };
  }
  // A full page may be truncated. A shorter page contains all groups.
  if (rows.length >= limit) return null;
  const dimension = source === 'statuses' ? 'edgeResponseStatus' : 'cacheStatus';
  return rows.every((row) => row.dimensions && Object.hasOwn(row.dimensions, dimension))
    ? rows
    : null;
}

function summarize(window, chunks, notes) {
  const metrics = {};
  let statusCounts = null;
  const traffic = chunks.flatMap((chunk) => chunk.traffic ?? []);
  if (!notes.traffic) {
    metrics.requests = traffic.reduce((total, row) => total + row.requests, 0);
    metrics.bytes = traffic.reduce((total, row) => total + row.bytes, 0);
  }
  if (!notes.statuses) {
    statusCounts = Object.fromEntries(STATUS_FAMILIES.map((family) => [family, 0]));
    for (const row of chunks.flatMap((chunk) => chunk.statuses ?? [])) {
      const code = Number(row.dimensions.edgeResponseStatus);
      const family =
        Number.isInteger(code) && code >= 100 && code < 600
          ? `${Math.floor(code / 100)}xx`
          : 'Unknown';
      statusCounts[family] += row.count;
    }
    const known = STATUS_FAMILIES.slice(0, -1).reduce(
      (sum, family) => sum + statusCounts[family],
      0
    );
    metrics.clientErrorRate = ratio(statusCounts['4xx'], known);
    metrics.serverErrorRate = ratio(statusCounts['5xx'], known);
  }
  if (!notes.cache) {
    let hits = 0;
    let requests = 0;
    for (const row of chunks.flatMap((chunk) => chunk.cache ?? [])) {
      requests += row.count;
      if (String(row.dimensions.cacheStatus).toLowerCase() === 'hit') hits += row.count;
    }
    metrics.cacheHitRate = ratio(hits, requests);
  }
  return { ...window, metrics, statusCounts, notes };
}

function unavailable(window, message) {
  return summarize(
    window,
    [],
    Object.fromEntries(Object.keys(GROUP_FIELDS).map((key) => [key, message]))
  );
}

async function readPeriod(window, { settings, apiToken, zoneTag, now, fetchImpl, signal }) {
  if (window.start < now.getTime() - settings.notOlderThan * 1000) {
    return unavailable(window, 'Cloudflare retention does not cover the full period.');
  }
  const maxWindow = Math.min(7 * DAY_MS, settings.maxDuration * 1000);
  if (Math.ceil((window.end - window.start) / maxWindow) > MAX_CHUNKS_PER_PERIOD) {
    return unavailable(window, 'The zone query limits are too narrow for this report.');
  }
  const notes = {};
  const sources = {};
  for (const [key, field] of Object.entries(REQUIRED_FIELDS)) {
    if (Array.isArray(settings.availableFields) && !settings.availableFields.includes(field)) {
      notes[key] = 'Cloudflare does not expose this metric for the zone or token.';
    } else {
      sources[key] = Math.min({ traffic: 1, statuses: 600, cache: 64 }[key], settings.maxPageSize);
    }
  }
  if (!Object.keys(sources).length) return summarize(window, [], notes);

  const query = groupQuery(sources);
  const chunks = [];
  for (let start = window.start; start < window.end; start += maxWindow) {
    const filter = {
      datetime_geq: new Date(start).toISOString(),
      datetime_lt: new Date(Math.min(window.end, start + maxWindow)).toISOString(),
      requestSource: 'eyeball'
    };
    try {
      const { data, errors } = await queryZone(
        apiToken,
        query,
        { zoneTag, window: filter },
        fetchImpl,
        signal
      );
      const chunk = {};
      for (const [source, limit] of Object.entries(sources)) {
        if (notes[source]) continue;
        const failed = errors.some(
          (error) =>
            !Array.isArray(error.path) ||
            !Object.keys(sources).some((key) => error.path.includes(key)) ||
            error.path.includes(source)
        );
        const groups = failed ? null : readGroups(data?.[source], limit, source);
        if (groups === null)
          notes[source] = 'Cloudflare returned incomplete evidence for this period.';
        else chunk[source] = groups;
      }
      chunks.push(chunk);
    } catch {
      return unavailable(
        window,
        'Cloudflare analytics could not be retrieved for the full period.'
      );
    }
    if (Object.keys(sources).every((source) => notes[source])) break;
  }
  return summarize(window, chunks, notes);
}

export async function loadSiteHealth(apiToken, zone, { fetchImpl = fetch, now = new Date() } = {}) {
  if (!ZONE_ID.test(zone.id)) throw new TypeError('Invalid Cloudflare zone identifier.');

  const windows = reportWindows(now);
  const report = { zone: { name: zone.name }, generatedAt: now.toISOString() };
  const signal = AbortSignal.timeout(18_000);
  let settings;
  try {
    const result = await queryZone(
      apiToken,
      SETTINGS_QUERY,
      { zoneTag: zone.id },
      fetchImpl,
      signal
    );
    if (!result.errors.length) settings = result.data?.settings?.httpRequestsAdaptiveGroups;
  } catch {
    // Availability is part of the report; never show provider errors or credentials.
  }
  const validSettings =
    settings?.enabled === true &&
    [settings.notOlderThan, settings.maxDuration, settings.maxPageSize].every(
      (value) => Number.isSafeInteger(value) && value > 0
    );
  if (!validSettings) {
    const message =
      'Cloudflare HTTP analytics is unavailable. Check Zone Analytics Read and the zone’s dataset access.';
    return {
      ...report,
      current: unavailable(windows.current, message),
      previous: unavailable(windows.previous, message)
    };
  }

  const options = { settings, apiToken, zoneTag: zone.id, now, fetchImpl, signal };
  const [current, previous] = await Promise.all([
    readPeriod(windows.current, options),
    readPeriod(windows.previous, options)
  ]);
  return { ...report, current, previous };
}
