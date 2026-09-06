import { handleCapabilities, handleExport } from '../../src/lib/exporter.js';

const DAY = 86400000;

export async function verifyZone(env, { zoneId, baseline, now = Date.now(), fetchImpl = fetch, sleep } = {}) {
  const headers = { Authorization: `Bearer ${env.EXPORT_API_KEY}` };
  const request = (route, params) => new Request(`https://verification.local/api/${route}?${new URLSearchParams(params)}`, { headers });
  const deps = { now, fetchImpl, ...(sleep ? { sleep } : {}) };
  const capResponse = await handleCapabilities(request('capabilities', { zoneId }), env, deps);
  const capabilities = await capResponse.json();
  if (!capResponse.ok) return { status: 'failed', stage: 'discovery', error: capabilities.error };
  if (!capabilities.canExport) return { status: 'failed', stage: 'discovery', reason: capabilities.reason, capabilities };

  if (baseline !== undefined && (baseline?.zoneId !== zoneId || !Array.isArray(baseline.windows) || baseline.windows.length !== 2)) {
    throw new Error('Baseline must match the zone and contain exactly two windows: one day and seven days.');
  }
  const end = Date.parse(capabilities.latestExclusiveDay);
  const windows = baseline?.windows ?? [1, 7].map(days => ({ from: new Date(end - days * DAY).toISOString().slice(0,10), to: capabilities.latestExclusiveDay }));
  if (baseline) {
    if (windows[0].to !== windows[1].to || ![1, 7].every((days, index) => {
      const window = windows[index];
      return (Date.parse(window.to) - Date.parse(window.from)) / DAY === days &&
        [window.requests, window.bytes].every(value => Number.isSafeInteger(value) && value >= 0);
    })) throw new Error('Baseline needs one-day then seven-day windows with the same exclusive end date and non-negative integer totals.');
  }
  const report = { status: 'awaiting-dashboard-comparison', capabilities, windows: [] };
  const results = [];
  for (const window of windows) {
    const response = await handleExport(request('cf-export', { zoneId, from: window.from, to: window.to }), env, deps);
    const payload = await response.json();
    if (!response.ok) return { ...report, status: 'failed', stage: 'export', error: payload.error };
    results.push(payload);
    const sum = field => {
      const value = payload.reduce((total, row) => total + BigInt(row.sum[field]), 0n);
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Window totals exceed safe numeric precision.');
      return Number(value);
    };
    const summary = { from: window.from, to: window.to, requests: sum('requests'), bytes: sum('bytes'), returnedDays: payload.length, missingDays: Number(response.headers.get('x-export-missing-days')) };
    if (baseline) summary.dashboardMatches = summary.requests === window.requests && summary.bytes === window.bytes;
    report.windows.push(summary);
  }
  const lastDay = results[1].filter(row => row.dimensions.date === windows[0].from);
  report.singleDayMatchesSevenDay = JSON.stringify(results[0]) === JSON.stringify(lastDay);
  const missing = report.windows.some(window => window.missingDays > 0);
  report.dashboardComparison = !baseline ? 'not-provided' : report.windows.every(window => window.dashboardMatches) ? 'matched' : 'mismatched';
  if (!report.singleDayMatchesSevenDay || report.dashboardComparison === 'mismatched') report.status = 'failed';
  else if (missing) report.status = 'incomplete-data';
  else if (baseline) report.status = 'verified';
  return report;
}
