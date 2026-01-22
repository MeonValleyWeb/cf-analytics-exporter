import { getAccessTokenForUser } from './_shared/cloudflare-oauth.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Use POST' };
  }

  try {
    const { userId } = JSON.parse(event.body || '{}');

    if (!userId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing userId.' })
      };
    }

    const accessToken = await getAccessTokenForUser(userId);
    const res = await fetch('https://api.cloudflare.com/client/v4/zones?per_page=50', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await res.json();
    if (!res.ok || !data?.success) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: data?.errors?.[0]?.message || 'Failed to fetch zones.' })
      };
    }

    const zones = (data.result || []).map(zone => ({
      id: zone.id,
      name: zone.name
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zones })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error?.message || 'Failed to load zones.' })
    };
  }
}
