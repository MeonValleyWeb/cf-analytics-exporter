import { getSupabaseClient } from './supabase.js';

const tokenEndpoint = 'https://api.cloudflare.com/client/v4/oauth2/token';

function getClientCredentials() {
  const clientId = process.env.CF_CLIENT_ID;
  const clientSecret = process.env.CF_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing Cloudflare OAuth client credentials.');
  }

  return { clientId, clientSecret };
}

async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getClientCredentials();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  });

  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const data = await res.json();
  if (!res.ok || data?.error) {
    throw new Error(data?.error_description || 'Failed to refresh Cloudflare token.');
  }

  return data;
}

export async function getAccessTokenForUser(userId) {
  if (!userId) {
    throw new Error('Missing userId.');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('cf_tokens')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    throw new Error('No Cloudflare token found. Connect your account.');
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at) : null;
  const isExpired = expiresAt ? Date.now() >= expiresAt.getTime() : false;

  if (!isExpired) {
    return data.access_token;
  }

  if (!data.refresh_token) {
    throw new Error('Cloudflare token expired. Reconnect your account.');
  }

  const refreshed = await refreshAccessToken(data.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

  await supabase.from('cf_tokens').update({
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: newExpiresAt,
    scope: refreshed.scope,
    token_type: refreshed.token_type
  }).eq('user_id', userId);

  return refreshed.access_token;
}
