import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupCloudflareAccounts,
  inspectZoneBotManagement,
  listCloudflareZones
} from '../src/lib/server/cloudflare-api.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('listCloudflareZones follows pagination and retains account metadata', async () => {
  const calls = [];
  const pageOne = Array.from({ length: 50 }, (_, index) => ({
    id: String(index).padStart(32, '0'),
    name: `zone-${index}.example`,
    account: { id: 'account-a', name: 'Agency A' },
    plan: { name: 'Free Website' }
  }));
  const fetchImpl = async (url) => {
    calls.push(url);
    const page = new URL(url).searchParams.get('page');
    return jsonResponse({
      success: true,
      result:
        page === '1'
          ? pageOne
          : [
              {
                id: 'f'.repeat(32),
                name: 'paid.example',
                account: { id: 'account-b', name: 'Agency B' },
                plan: { name: 'Pro' }
              }
            ],
      result_info: { total_pages: 2 }
    });
  };

  const zones = await listCloudflareZones('secret', { fetchImpl });

  assert.equal(calls.length, 2);
  assert.equal(zones.length, 51);
  assert.deepEqual(zones[50].account, { id: 'account-b', name: 'Agency B' });
  assert.equal(zones[0].plan.isPaid, false);
  assert.equal(zones[50].plan.isPaid, true);
  assert.match(calls[0], /per_page=50/);
});

test('groupCloudflareAccounts returns stable account counts', () => {
  const accounts = groupCloudflareAccounts([
    { account: { id: 'b', name: 'Beta' } },
    { account: { id: 'a', name: 'Alpha' } },
    { account: { id: 'a', name: 'Alpha' } }
  ]);

  assert.deepEqual(accounts, [
    { id: 'a', name: 'Alpha', zoneCount: 2 },
    { id: 'b', name: 'Beta', zoneCount: 1 }
  ]);
});

test('inspectZoneBotManagement normalizes missing permission', async () => {
  const result = await inspectZoneBotManagement('secret', 'a'.repeat(32), {
    fetchImpl: async () =>
      jsonResponse({ success: false, errors: [{ code: 9109, message: 'Unauthorized' }] }, 403)
  });

  assert.equal(result.status, 'permission_required');
  assert.equal(result.code, 9109);
  assert.match(result.message, /Bot Management Read/);
});

test('inspectZoneBotManagement returns available config', async () => {
  const result = await inspectZoneBotManagement('secret', 'a'.repeat(32), {
    fetchImpl: async () => jsonResponse({ success: true, result: { ai_bots_protection: 'block' } })
  });

  assert.deepEqual(result, {
    status: 'available',
    config: { ai_bots_protection: 'block' }
  });
});
