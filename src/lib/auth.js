import { timingSafeEqual } from 'node:crypto';
import { fail } from './http.js';

export function authorizeScope(request, env, { tokenName = 'CF_API_TOKEN', scopeName = 'CF_ALLOWED_ZONE_IDS' } = {}) {
  const secret = env.EXPORT_API_KEY;
  const zones = typeof env[scopeName] === 'string'
    ? env[scopeName].split(',').map((zone) => zone.trim().toLowerCase()) : [];
  if (typeof secret !== 'string' || secret.length < 32 || !zones.length ||
      zones.some((zone) => !/^[a-f0-9]{32}$/.test(zone)) ||
      typeof env[tokenName] !== 'string' || !env[tokenName].trim()) {
    fail(503, 'NOT_CONFIGURED', 'The exporter is not configured.');
  }
  const credential = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1] || '';
  const expected = new TextEncoder().encode(secret);
  const supplied = new TextEncoder().encode(credential);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    fail(401, 'UNAUTHORIZED', 'A valid exporter bearer token is required.', {
      'WWW-Authenticate': 'Bearer realm="analytics-exporter"',
    });
  }
  return new Set(zones);
}
