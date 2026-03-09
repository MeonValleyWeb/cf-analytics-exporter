import { getSupabaseClient } from './supabase.js';

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

  return data.api_token;
}

export async function upsertTokenForUser(userId, apiToken) {
  if (!userId || !apiToken) {
    throw new Error('Missing userId or apiToken.');
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('cf_tokens')
    .upsert({
      user_id: userId,
      api_token: apiToken,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) {
    throw new Error(error.message);
  }
}
