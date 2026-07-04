import { getSupabaseClient } from './supabase.js';
import { getEnv } from './env.js';
import { encryptToken, decryptToken } from './token-crypto.js';

function getEncryptionKey() {
  const key = getEnv('TOKEN_ENCRYPTION_KEY');
  if (!key) {
    throw new Error('Missing TOKEN_ENCRYPTION_KEY (generate with: openssl rand -base64 32).');
  }
  return key;
}

export async function getTokenForUser(userId) {
  if (!userId) {
    throw new Error('Missing userId.');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('cf_tokens')
    .select('api_token')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.api_token) {
    throw new Error('No Cloudflare token found. Save a token first.');
  }

  return decryptToken(data.api_token, getEncryptionKey());
}

export async function upsertTokenForUser(userId, apiToken) {
  if (!userId || !apiToken) {
    throw new Error('Missing userId or apiToken.');
  }

  const encrypted = await encryptToken(apiToken, getEncryptionKey());

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('cf_tokens')
    .upsert(
      {
        user_id: userId,
        api_token: encrypted,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id' }
    );

  if (error) {
    throw new Error(error.message);
  }
}
