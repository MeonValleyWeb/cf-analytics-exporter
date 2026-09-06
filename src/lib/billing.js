import { authorizeScope } from './auth.js';
import { requestCloudflareJson } from './cloudflare-client.js';
import { ExportError, fail, json } from './http.js';

function invalid() {
  fail(502, 'UPSTREAM_INVALID_BILLING', 'Cloudflare returned incomplete or invalid billing data.');
}

function text(value, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > 1024) invalid();
  return value;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) invalid();
  const day = value.slice(0, 10);
  if (new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) !== day ||
      Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) invalid();
  return new Date(value).toISOString();
}

function amount(value) {
  // Missing amounts remain unknown. Never turn missing cost into zero spend.
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) invalid();
  return String(value);
}

// Sum the decimal representations supplied by the API without binary-float addition.
export function sumAmounts(values) {
  let total = 0n, scale = 0;
  for (const value of values) {
    const [mantissa, exponent = '0'] = value.toLowerCase().split('e');
    const decimals = mantissa.split('.')[1]?.length ?? 0;
    const places = decimals - Number(exponent);
    let coefficient = BigInt(mantissa.replace('.', ''));
    if (places < 0) coefficient *= 10n ** BigInt(-places);
    const valueScale = Math.max(0, places);
    if (valueScale > scale) { total *= 10n ** BigInt(valueScale - scale); scale = valueScale; }
    total += coefficient * 10n ** BigInt(scale - valueScale);
  }
  const sign = total < 0n ? '-' : '';
  let digits = (total < 0n ? -total : total).toString().padStart(scale + 1, '0');
  if (scale) digits = `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, '');
  return sign + digits;
}

function normalizeRow(row, accountId) {
  if (!row || row.BillingAccountId !== accountId || row.ChargeCategory !== 'Usage') invalid();
  const currency = row.BillingCurrency == null ? null : text(row.BillingCurrency);
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) invalid();
  const start = timestamp(row.ChargePeriodStart), end = timestamp(row.ChargePeriodEnd);
  const periodStart = timestamp(row.BillingPeriodStart);
  if (end <= start || periodStart > start) invalid();
  const cost = amount(row.ContractedCost);
  if (cost !== null && currency === null) invalid();
  const zoneId = row.ZoneId == null || row.ZoneId === '' ? null : row.ZoneId;
  if (zoneId !== null && (typeof zoneId !== 'string' || !/^[a-f0-9]{32}$/i.test(zoneId))) invalid();
  return {
    accountId, billingPeriodStart: periodStart, chargePeriodStart: start, chargePeriodEnd: end,
    service: text(row.ServiceName), family: text(row.ServiceFamilyName, true),
    subscriptionId: text(row.SubscriptionId, true), zoneId,
    currency, contractedCost: cost,
    cumulativeContractedCost: amount(row.CumulatedContractedCost),
    consumedQuantity: amount(row.ConsumedQuantity), consumedUnit: typeof row.ConsumedUnit === 'string' ? row.ConsumedUnit : null,
    pricingQuantity: amount(row.PricingQuantity), pricingUnit: text(row.PricingUnit, true),
  };
}

function summaries(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.billingPeriodStart, row.service, row.currency]);
    const bucket = buckets.get(key) ?? { billingPeriodStart: row.billingPeriodStart, service: row.service, currency: row.currency, amounts: [], missingCostRows: 0, rowCount: 0 };
    bucket.rowCount++;
    if (row.contractedCost === null) bucket.missingCostRows++;
    else bucket.amounts.push(row.contractedCost);
    buckets.set(key, bucket);
  }
  return [...buckets.values()].map(({ amounts, ...bucket }) => ({
    ...bucket, knownContractedCost: sumAmounts(amounts),
    contractedCost: bucket.missingCostRows ? null : sumAmounts(amounts),
  })).sort((a, b) => JSON.stringify([a.billingPeriodStart, a.service, a.currency]).localeCompare(JSON.stringify([b.billingPeriodStart, b.service, b.currency])));
}

async function getResult(url, token, dependencies) {
  const payload = await requestCloudflareJson(url, { method: 'GET' }, token, dependencies);
  if (payload.success !== true || (payload.errors != null && (!Array.isArray(payload.errors) || payload.errors.length))) {
    fail(502, 'UPSTREAM_BILLING_ERROR', 'Cloudflare rejected the billing request. Check Billing Read permission and account access.');
  }
  if (payload.result_info?.total_pages > 1 || payload.result_info?.cursor || payload.result_info?.cursors?.after ||
      (Array.isArray(payload.result) && payload.result_info?.total_count > payload.result.length)) {
    fail(502, 'UPSTREAM_BILLING_PAGINATION', 'Cloudflare returned paginated billing data; a complete snapshot could not be established.');
  }
  return payload.result;
}

export async function handleBilling(request, env, {
  fetchImpl = fetch, now = Date.now(),
  sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  signal = AbortSignal.timeout(25_000),
} = {}) {
  try {
    if (request.method !== 'GET') fail(405, 'METHOD_NOT_ALLOWED', 'Use GET.', { Allow: 'GET' });
    const accounts = authorizeScope(request, env, { tokenName: 'CF_BILLING_API_TOKEN', scopeName: 'CF_ALLOWED_ACCOUNT_IDS' });
    const input = [...new URL(request.url).searchParams];
    if (input.length !== 1 || input[0][0] !== 'accountId' || !/^[a-f0-9]{32}$/i.test(input[0][1])) {
      fail(400, 'INVALID_INPUT', 'Provide one accountId; custom date ranges are not supported yet.');
    }
    const accountId = input[0][1].toLowerCase();
    if (!accounts.has(accountId)) fail(403, 'ACCOUNT_FORBIDDEN', 'This account is not enabled for billing.');
    const dependencies = { fetchImpl, sleep, signal };
    const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}/billable-usage`;
    const info = await getResult(`${base}/info`, env.CF_BILLING_API_TOKEN, dependencies);
    if (!info || typeof info.covered !== 'boolean') invalid();
    if (!info.covered) fail(422, 'BILLING_UNAVAILABLE', 'The account is not covered by this billable usage API.');
    if (!Array.isArray(info.subscriptions)) invalid();
    const subscriptions = info.subscriptions.map(subscription => ({
      id: text(subscription?.id), anchor: timestamp(subscription?.billing_cycle_anchor_timestamp),
      start: timestamp(subscription?.start_timestamp), end: subscription?.end_timestamp == null ? null : timestamp(subscription.end_timestamp),
    }));
    const result = await getResult(base, env.CF_BILLING_API_TOKEN, dependencies);
    if (!Array.isArray(result) || result.length > 10000) invalid();
    const rows = result.map(row => normalizeRow(row, accountId));
    return json({
      schemaVersion: 1, source: 'cloudflare-billable-usage-v1', accountId,
      scope: 'current-billing-period', collectedAt: new Date(now).toISOString(),
      freshness: { updateCadence: 'daily', sourceUpdatedAt: null,
        latestChargePeriodEnd: rows.length ? rows.reduce((end, row) => row.chargePeriodEnd > end ? row.chargePeriodEnd : end, '') : null },
      status: rows.length === 0 ? 'no-data' : rows.some(row => row.contractedCost === null) ? 'partial-cost-data' : 'available',
      invoiceAuthoritative: true, supportsHardCap: false,
      subscriptions, rows, summaries: summaries(rows),
    });
  } catch (error) {
    if (error instanceof ExportError) return json({ error: { code: error.code, message: error.message } }, error.status, error.headers);
    return json({ error: { code: 'INTERNAL_ERROR', message: 'Billing ingestion could not complete.' } }, 500);
  }
}
