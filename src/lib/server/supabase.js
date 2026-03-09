import { createClient } from '@supabase/supabase-js';

function getEnv(locals, key) {
  return locals?.runtime?.env?.[key] ?? import.meta.env[key];
}

export function getSupabaseClient(locals) {
  const supabaseUrl = getEnv(locals, 'SUPABASE_URL');
  const supabaseKey = getEnv(locals, 'SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials.');
  }

  return createClient(supabaseUrl, supabaseKey);
}
