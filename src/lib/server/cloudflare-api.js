const API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const ZONE_PAGE_SIZE = 50;
const MAX_ZONE_PAGES = 100;

export class CloudflareApiError extends Error {
  constructor(message, { status = 500, code = null } = {}) {
    super(message);
    this.name = 'CloudflareApiError';
    this.status = status;
    this.code = code;
  }
}

function getCloudflareError(data, fallback) {
  return {
    message: data?.errors?.[0]?.message || fallback,
    code: data?.errors?.[0]?.code ?? null
  };
}

async function cloudflareGet(apiToken, path, fetchImpl) {
  const response = await fetchImpl(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: 'application/json'
    }
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new CloudflareApiError(`Cloudflare returned an invalid response (${response.status}).`, {
      status: response.status
    });
  }

  if (!response.ok || !data?.success) {
    const error = getCloudflareError(data, `Cloudflare request failed (${response.status}).`);
    throw new CloudflareApiError(error.message, {
      status: response.status,
      code: error.code
    });
  }

  return data;
}

function normalizeZone(zone) {
  const planName = zone.plan?.name || zone.plan?.legacy_id || 'Unknown';

  return {
    id: zone.id,
    name: zone.name,
    status: zone.status || 'unknown',
    type: zone.type || 'unknown',
    account: {
      id: zone.account?.id || 'unknown',
      name: zone.account?.name || 'Unknown account'
    },
    plan: {
      name: planName,
      isPaid: !String(planName).toLowerCase().includes('free')
    }
  };
}

export async function listCloudflareZones(apiToken, { fetchImpl = fetch } = {}) {
  const zones = [];

  for (let page = 1; page <= MAX_ZONE_PAGES; page += 1) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(ZONE_PAGE_SIZE)
    });
    const data = await cloudflareGet(apiToken, `/zones?${params}`, fetchImpl);
    const pageZones = Array.isArray(data.result) ? data.result : [];
    zones.push(...pageZones.map(normalizeZone));

    const totalPages = Number(data.result_info?.total_pages);
    if ((Number.isFinite(totalPages) && page >= totalPages) || pageZones.length < ZONE_PAGE_SIZE) {
      return zones;
    }
  }

  throw new CloudflareApiError(
    `Cloudflare zone listing exceeded the ${MAX_ZONE_PAGES}-page safety limit.`
  );
}

export function groupCloudflareAccounts(zones) {
  const accounts = new Map();

  for (const zone of zones) {
    const account = zone.account || { id: 'unknown', name: 'Unknown account' };
    const existing = accounts.get(account.id) || {
      id: account.id,
      name: account.name,
      zoneCount: 0
    };
    existing.zoneCount += 1;
    accounts.set(account.id, existing);
  }

  return [...accounts.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function getZoneBotManagement(apiToken, zoneId, { fetchImpl = fetch } = {}) {
  const data = await cloudflareGet(apiToken, `/zones/${zoneId}/bot_management`, fetchImpl);
  return data.result || {};
}

export async function inspectZoneBotManagement(apiToken, zoneId, options = {}) {
  try {
    const config = await getZoneBotManagement(apiToken, zoneId, options);
    return { status: 'available', config };
  } catch (error) {
    if (!(error instanceof CloudflareApiError)) {
      return { status: 'unavailable', message: error?.message || 'Bot configuration unavailable.' };
    }

    if (error.status === 401 || error.status === 403) {
      return {
        status: 'permission_required',
        code: error.code,
        message: 'The token needs Bot Management Read permission for this zone.'
      };
    }

    if (error.status === 404) {
      return {
        status: 'unsupported',
        code: error.code,
        message: 'Cloudflare did not expose Bot Management configuration for this zone.'
      };
    }

    if (error.status === 429) {
      return {
        status: 'rate_limited',
        code: error.code,
        message: 'Cloudflare rate-limited the Bot Management request. Try again later.'
      };
    }

    return {
      status: 'unavailable',
      code: error.code,
      message: error.message
    };
  }
}
