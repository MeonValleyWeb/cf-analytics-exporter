import { fail } from './http.js';
import { requestGraphql } from './cloudflare-client.js';

const DAY = 86_400_000;
export const MAX_DAYS = 366;
const MAX_WINDOWS = 32;
const REQUIRED_FIELDS = ['dimensions_date', 'sum_requests', 'sum_bytes'];
const QUERY = `query DatasetCapabilities($zoneTag: string!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      settings {
        httpRequests1dGroups {
          enabled availableFields maxDuration maxPageSize maxNumberOfFields notOlderThan
        }
      }
    }
  }
}`;

export async function discoverCapabilities(zoneId, token, now, dependencies) {
  const payload = await requestGraphql(QUERY, { zoneTag: zoneId }, token, dependencies);
  const zones = payload.data?.viewer?.zones;
  if (!Array.isArray(zones) || zones.length !== 1) {
    fail(502, 'UPSTREAM_INVALID_SETTINGS', 'Cloudflare did not return settings for the requested zone.');
  }
  const settings = zones[0]?.settings?.httpRequests1dGroups;
  if (!settings || typeof settings.enabled !== 'boolean') {
    fail(502, 'UPSTREAM_INVALID_SETTINGS', 'Cloudflare did not return valid dataset settings.');
  }
  const base = {
    dataset: 'httpRequests1dGroups', zoneId, enabled: settings.enabled,
    checkedAt: new Date(now).toISOString(),
    latestExclusiveDay: new Date(now).toISOString().slice(0, 10),
    maxExportDays: MAX_DAYS, maxWindows: MAX_WINDOWS,
  };
  // Disabled datasets may omit their limits; never infer usable defaults.
  if (!settings.enabled) return { ...base, canExport: false, reason: 'DATASET_UNAVAILABLE' };
  if (!Array.isArray(settings.availableFields) || !settings.availableFields.every((field) => typeof field === 'string') ||
      ![settings.maxDuration, settings.maxPageSize, settings.maxNumberOfFields, settings.notOlderThan]
        .every((value) => Number.isSafeInteger(value) && value >= 0)) {
    fail(502, 'UPSTREAM_INVALID_SETTINGS', 'Cloudflare returned incomplete or invalid dataset limits.');
  }
  const missingFields = REQUIRED_FIELDS.filter((field) => !settings.availableFields.includes(field));
  const maxWindowDays = Math.min(MAX_DAYS, settings.maxPageSize, Math.floor(settings.maxDuration / 86400));
  // The first partly retained day is excluded; we export complete UTC days only.
  const cutoff = Math.max(Date.parse('0000-01-01T00:00:00Z'), now - settings.notOlderThan * 1000);
  const earliestCompleteDay = new Date(Math.ceil(cutoff / DAY) * DAY).toISOString().slice(0, 10);
  const reason = missingFields.length || settings.maxNumberOfFields < REQUIRED_FIELDS.length ? 'DATASET_FIELDS_UNAVAILABLE'
    : maxWindowDays < 1 || earliestCompleteDay >= base.latestExclusiveDay ? 'DATASET_LIMITS_UNSUPPORTED' : null;
  return {
    ...base, canExport: reason === null, reason,
    availableFields: settings.availableFields, missingFields,
    maxDurationSeconds: settings.maxDuration,
    maxPageSize: settings.maxPageSize,
    maxNumberOfFields: settings.maxNumberOfFields,
    retentionSeconds: settings.notOlderThan,
    earliestCompleteDay, maxWindowDays,
  };
}

export function planWindows(params, capabilities) {
  if (!capabilities.canExport) {
    fail(422, capabilities.reason, 'The daily requests/bytes dataset is unavailable with the current permissions or limits.');
  }
  if (params.from < capabilities.earliestCompleteDay) {
    fail(422, 'HISTORY_UNAVAILABLE', `Complete retained days start at ${capabilities.earliestCompleteDay}. Choose a later from date.`);
  }
  const start = Date.parse(params.from);
  const end = Date.parse(params.to);
  const days = (end - start) / DAY;
  if (Math.ceil(days / capabilities.maxWindowDays) > MAX_WINDOWS) {
    fail(422, 'TOO_MANY_WINDOWS', `This range needs more than ${MAX_WINDOWS} queries. Choose a smaller date range.`);
  }
  const windows = [];
  for (let cursor = start; cursor < end;) {
    const next = Math.min(end, cursor + capabilities.maxWindowDays * DAY);
    windows.push({
      from: new Date(cursor).toISOString().slice(0, 10),
      to: new Date(next).toISOString().slice(0, 10),
      days: (next - cursor) / DAY,
    });
    cursor = next;
  }
  return windows;
}
