const HOSTNAME_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const DEFAULT_MAX_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 8000;

export function isValidZoneHostname(hostname) {
  return (
    typeof hostname === 'string' &&
    hostname.length <= 253 &&
    HOSTNAME_PATTERN.test(hostname) &&
    !IPV4_PATTERN.test(hostname) &&
    !hostname.includes('..')
  );
}

async function readBodyWithLimit(response, maxBytes) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new RangeError('robots.txt exceeds the response-size limit.');
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    bytesRead += value.byteLength;
    if (bytesRead > maxBytes) {
      await reader.cancel();
      throw new RangeError('robots.txt exceeds the response-size limit.');
    }
    text += decoder.decode(value, { stream: true });
  }

  return text + decoder.decode();
}

export async function inspectRobotsTxt(
  hostname,
  {
    fetchImpl = fetch,
    maxBytes = DEFAULT_MAX_BYTES,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    now = () => new Date()
  } = {}
) {
  if (!isValidZoneHostname(hostname)) {
    throw new Error('Invalid Cloudflare zone hostname.');
  }

  const url = `https://${hostname}/robots.txt`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'text/plain,text/*;q=0.9,*/*;q=0.1',
        'User-Agent': 'CF-Analytics-Crawler-Guard/0.7'
      },
      redirect: 'manual',
      signal: controller.signal
    });

    const base = {
      url,
      httpStatus: response.status,
      contentType: response.headers.get('content-type') || null,
      fetchedAt: now().toISOString()
    };

    if (response.status >= 300 && response.status < 400) {
      return {
        ...base,
        status: 'redirected',
        location: response.headers.get('location') || null,
        body: null
      };
    }

    if (response.status === 404 || response.status === 410) {
      return { ...base, status: 'missing', body: null };
    }

    if (response.status === 401 || response.status === 403) {
      return { ...base, status: 'blocked', body: null };
    }

    if (!response.ok) {
      return { ...base, status: 'http_error', body: null };
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { ...base, status: 'too_large', body: null };
    }

    try {
      const body = await readBodyWithLimit(response, maxBytes);
      return { ...base, status: 'available', body };
    } catch (error) {
      if (error instanceof RangeError) {
        return { ...base, status: 'too_large', body: null };
      }
      throw error;
    }
  } catch (error) {
    return {
      url,
      status: error?.name === 'AbortError' ? 'timeout' : 'network_error',
      httpStatus: null,
      contentType: null,
      fetchedAt: now().toISOString(),
      body: null,
      message: error?.name === 'AbortError' ? 'robots.txt request timed out.' : error?.message
    };
  } finally {
    clearTimeout(timeout);
  }
}
