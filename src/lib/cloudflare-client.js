import { ExportError, fail } from './http.js';

export async function requestGraphql(query, variables, token, { fetchImpl, sleep, signal }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      signal?.throwIfAborted();
      const response = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const retryable = [429, 500, 502, 503, 504].includes(response.status);
        const rawDelay = response.headers.get('retry-after');
        const retrySeconds = rawDelay === null ? 0.25 : /^\d+$/.test(rawDelay)
          ? Number(rawDelay) : Math.max(0, (Date.parse(rawDelay) - Date.now()) / 1000);
        if (retryable && attempt === 0 && Number.isFinite(retrySeconds) && retrySeconds <= 2) {
          await sleep(retrySeconds * 1000);
          continue;
        }
        fail(retryable ? 503 : 502, 'UPSTREAM_HTTP_ERROR', 'Cloudflare could not complete the query. Try again later.',
          retryable ? { 'Retry-After': String(Math.min(60, Math.max(1, Math.ceil(retrySeconds) || 1))) } : {});
      }
      let payload;
      try { payload = await response.json(); } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') throw error;
        fail(502, 'UPSTREAM_INVALID_RESPONSE', 'Cloudflare returned an invalid response.');
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        fail(502, 'UPSTREAM_INVALID_RESPONSE', 'Cloudflare returned an invalid response.');
      }
      if (payload.errors != null && (!Array.isArray(payload.errors) || payload.errors.length)) {
        fail(502, 'UPSTREAM_GRAPHQL_ERROR', 'Cloudflare rejected the query. Check token permissions, dataset access and date limits.');
      }
      signal?.throwIfAborted();
      return payload;
    } catch (error) {
      if (signal?.aborted) fail(504, 'EXPORT_TIMEOUT', 'The operation exceeded its time budget. Try a smaller date range.');
      if (error instanceof ExportError) throw error;
      if (attempt === 0) { await sleep(250); continue; }
      const timedOut = ['TimeoutError', 'AbortError'].includes(error.name);
      fail(timedOut ? 504 : 502, timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNAVAILABLE', 'Cloudflare could not be reached. Try again later.');
    }
  }
}
