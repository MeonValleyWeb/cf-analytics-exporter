import { getTokenForUser } from '../../lib/server/cloudflare-token.js';
import { groupCloudflareAccounts, listCloudflareZones } from '../../lib/server/cloudflare-api.js';
import { json } from '../../lib/server/http.js';

export const prerender = false;

export async function GET({ locals }) {
  const { userId } = locals.auth();
  if (!userId) {
    return json({ error: 'Sign in required.' }, 401);
  }

  try {
    const accessToken = await getTokenForUser(userId);
    const zones = await listCloudflareZones(accessToken);
    return json({ zones, accounts: groupCloudflareAccounts(zones) });
  } catch (error) {
    return json({ error: error?.message || 'Failed to load zones.' }, 500);
  }
}
