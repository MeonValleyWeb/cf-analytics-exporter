import { getSupabaseClient } from './_shared/supabase.js';

const tokenEndpoint = 'https://api.cloudflare.com/client/v4/oauth2/token';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Use GET' };
  }

  try {
    const { code, state } = event.queryStringParameters || {};
    const clientId = process.env.CF_CLIENT_ID;
    const clientSecret = process.env.CF_CLIENT_SECRET;
    const redirectUri = process.env.CF_REDIRECT_URI;

    if (!code || !state) {
      return { statusCode: 400, body: 'Missing code or state.' };
    }

    if (!clientId || !clientSecret || !redirectUri) {
      return { statusCode: 500, body: 'Missing OAuth configuration.' };
    }

    const decodedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    const userId = decodedState.userId;
    const returnTo = decodedState.returnTo || '/dashboard';

    if (!userId) {
      return { statusCode: 400, body: 'Missing userId in state.' };
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri
    });

    const res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });

    const tokenData = await res.json();
    if (!res.ok || tokenData?.error) {
      return {
        statusCode: 500,
        body: tokenData?.error_description || 'Failed to fetch access token.'
      };
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('cf_tokens')
      .upsert({
        user_id: userId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt,
        scope: tokenData.scope,
        token_type: tokenData.token_type
      }, { onConflict: 'user_id' });

    if (error) {
      return { statusCode: 500, body: error.message };
    }

    return {
      statusCode: 302,
      headers: { Location: `${returnTo}?cf=connected` }
    };
  } catch (error) {
    return { statusCode: 500, body: error?.message || 'OAuth callback failed.' };
  }
}
