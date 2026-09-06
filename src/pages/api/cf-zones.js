import { requireUser, sessionError } from '../../lib/server/session.js';
import { getTokenForUser } from '../../lib/server/cloudflare-token.js';

export const prerender = false;

export async function POST({ request, locals }) {
  try {
    const userId = requireUser(locals, request);

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Missing userId.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const accessToken = await getTokenForUser(userId, locals);
    const res = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=50', {
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    if (!res.ok || !data?.success) {
      return new Response(
        JSON.stringify({ error: data?.errors?.[0]?.message || 'Failed to fetch zones.' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
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

    return new Response(JSON.stringify({ zones }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return sessionError(error);
  }
}
