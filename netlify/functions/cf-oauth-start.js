export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Use POST' };
  }

  try {
    const { userId, returnTo } = JSON.parse(event.body || '{}');
    const clientId = process.env.CF_CLIENT_ID;
    const redirectUri = process.env.CF_REDIRECT_URI;

    if (!userId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing userId.' })
      };
    }

    if (!clientId || !redirectUri) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing Cloudflare OAuth configuration.' })
      };
    }

    const state = Buffer.from(JSON.stringify({
      userId,
      returnTo: returnTo || '/dashboard'
    })).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'account:read zone:read analytics:read',
      state
    });

    const url = `https://dash.cloudflare.com/oauth2/authorize?${params.toString()}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error?.message || 'Failed to start OAuth.' })
    };
  }
}
