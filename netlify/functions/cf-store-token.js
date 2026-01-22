import { upsertTokenForUser } from './_shared/cloudflare-token.js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Use POST' };
  }

  try {
    const { userId, apiToken } = JSON.parse(event.body || '{}');

    if (!userId || !apiToken) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing userId or apiToken.' })
      };
    }

    await upsertTokenForUser(userId, apiToken);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error?.message || 'Failed to save token.' })
    };
  }
}
