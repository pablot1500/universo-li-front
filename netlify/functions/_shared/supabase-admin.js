import { createClient } from '@supabase/supabase-js';

let client = null;

export const getSupabaseAdmin = () => {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !serviceRole) {
    throw new Error('Supabase admin client not configured');
  }

  client = createClient(url, serviceRole);
  return client;
};
