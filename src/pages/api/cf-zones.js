import { getTokenForUser } from '../../lib/server/cloudflare-token.js';
import { json } from '../../lib/server/http.js';

export const prerender = false;

export async function GET({ locals }) {
  const { userId } = locals.auth();
  if (!userId) {
    return json({ error: 'Sign in required.' }, 401);
  }

  try {
    const accessToken = await getTokenForUser(userId, locals);
    const res = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=50', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    if (!res.ok || !data?.success) {
      return json({ error: data?.errors?.[0]?.message || 'Failed to fetch zones.' }, 500);
    }

    const zones = (data.result || []).map((zone) => {
      const planName = zone.plan?.name || zone.plan?.legacy_id || 'Unknown';
      const isPaid = !String(planName).toLowerCase().includes('free');
      return {
        id: zone.id,
        name: zone.name,
        plan: {
          name: planName,
          isPaid
        }
      };
    });

    return json({ zones });
  } catch (error) {
    return json({ error: error?.message || 'Failed to load zones.' }, 500);
  }
}
