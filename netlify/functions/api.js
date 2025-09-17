import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

export async function handler(event) {
  try {
    const path = new URL(event.rawUrl).pathname.replace('/.netlify/functions/api', '');
    if (event.httpMethod === 'GET' && (path === '/productos' || path === '/' )) {
      const { data, error } = await supabase
        .from('data_store')
        .select('data,collection,external_id')
        .eq('collection', 'products')
        .limit(200);

      if (error) return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
      return { statusCode: 200, body: JSON.stringify((data ?? []).map(r => r.data)) };
    }
    return { statusCode: 404, body: 'Not found' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message || 'Server error' }) };
  }
}
