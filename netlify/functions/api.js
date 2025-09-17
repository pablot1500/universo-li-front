// netlify/functions/api.js
import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

    if (!SUPABASE_URL) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'SUPABASE_URL missing in site env' })
      };
    }
    if (!SUPABASE_SERVICE_ROLE) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'SUPABASE_SERVICE_ROLE missing in site env' })
      };
    }

    // Crear el cliente aquí (dentro del handler) para evitar fallos en la carga del módulo
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

    const url = new URL(event.rawUrl);
    const qCollection = url.searchParams.get('collection');
    const path = url.pathname.replace('/.netlify/functions/api', '').replace(/^\/+/, '');

    const aliasMap = {
      productos: 'products',
      producto: 'products',
      categorias: 'categories',
      categoria: 'categories'
    };

    const pathCollection = path.split('/').filter(Boolean)[0];
    const aliasCollection = pathCollection ? (aliasMap[pathCollection] || pathCollection) : null;
    const collection = qCollection || aliasCollection || 'products';

    const limit = Number(url.searchParams.get('limit') || 200);

    const { data, error } = await supabase
      .from('data_store')
      .select('data,collection,external_id')
      .eq('collection', collection)
      .limit(limit);

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
    return { statusCode: 200, body: JSON.stringify((data ?? []).map(r => r.data)) };
  } catch (err) {
    // devolvemos un JSON claro para que curl/jq lo parseen
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
}
