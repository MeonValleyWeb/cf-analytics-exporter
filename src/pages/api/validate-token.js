import { requireUser, sessionError } from '../../lib/server/session.js';
export const prerender = false;

export async function POST({ request, locals }) {
  try {
    const userId = requireUser(locals, request);
    const { apiToken, zoneId } = await request.json();

    if (typeof apiToken !== 'string' || !apiToken || !/^[a-f0-9]{32}$/i.test(zoneId)) {
      return new Response(JSON.stringify({ valid: false, error: 'apiToken and zoneId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tokenCheckRes = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    const tokenCheckData = await tokenCheckRes.json();

    if (!tokenCheckRes.ok || !tokenCheckData.success) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: 'Invalid API token. Please check that you copied the full token.'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      const cfError = data.errors?.[0];
      let errorMsg = 'Unable to access this zone.';

      if (cfError?.code === 7003 || res.status === 403) {
        errorMsg =
          "Token doesn't have permission for this zone. Ensure your token includes Zone:Read and Zone.Analytics:Read permissions for this zone.";
      } else if (cfError?.code === 7000 || res.status === 404) {
        errorMsg =
          "Zone not found. Please check the Zone ID is correct (32-character hex string from your domain's Overview page).";
      } else if (cfError?.message) {
        errorMsg = cfError.message;
      }

      return new Response(JSON.stringify({ valid: false, error: errorMsg }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(
      JSON.stringify({
        valid: true,
        zoneName: data.result.name,
        zoneId: data.result.id
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (error) {
    return sessionError(error);
  }
}
