// netlify/functions/api.js
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const aliasMap = {
  productos: 'products',
  producto: 'products',
  categorias: 'categories',
  categoria: 'categories',
  componentes: 'components',
  componente: 'components',
  ventas: 'sales',
  venta: 'sales',
  comentarios: 'componentComments',
  'comentarios-componentes': 'componentComments',
  comentarioscomponentes: 'componentComments'
};

const defaultHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'no-store'
};

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: defaultHeaders,
  body: JSON.stringify(payload)
});

const decodeBody = (event) => {
  if (!event.body) return null;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  if (!raw?.trim()) return null;
  return JSON.parse(raw);
};

// Reutilizar cliente de Supabase entre invocaciones (mejor latencia en caliente)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: defaultHeaders };
  }

  try {
    const url = new URL(event.rawUrl);
    // Fast-path: ping sin tocar DB para medir piso de función
    if (url.searchParams.has('ping')) {
      return jsonResponse(200, { ok: true, t: Date.now() });
    }

    if (!supabase) {
      return jsonResponse(500, { error: 'Supabase client not configured' });
    }

    const qCollection = url.searchParams.get('collection');
    const rawPath = (event.rawPath || url.pathname || '')
      .replace('/.netlify/functions/api', '')
      .replace(/^\/+/g, '');

    let pathSegments = rawPath.split('/').filter(Boolean);
    if (pathSegments[0] === 'api') pathSegments = pathSegments.slice(1);

    const pathCollection = pathSegments[0];
    const aliasCollection = pathCollection ? (aliasMap[pathCollection] || pathCollection) : null;
    const collection = (qCollection || aliasCollection || 'products');
    const resourceId = url.searchParams.get('id') || pathSegments[1] || null;

    const limitParam = url.searchParams.get('limit');
    const fieldsParam = (url.searchParams.get('fields') || '').trim();
    const fields = fieldsParam
      ? fieldsParam.split(',').map(s => s.trim()).filter(Boolean)
      : null;
    const limit = Number(limitParam);
    let payload = null;
    try {
      payload = decodeBody(event);
    } catch (err) {
      return jsonResponse(400, { error: 'Invalid JSON body', detail: err.message });
    }

    const method = (event.httpMethod || 'GET').toUpperCase();

    if (method === 'GET') {
      let query = supabase
        .from('data_store')
        .select('data,collection,external_id')
        .eq('collection', collection);

      if (resourceId) {
        const { data, error } = await query
          .eq('external_id', resourceId)
          .limit(1);
        if (error) return jsonResponse(500, { error: error.message });
        const record = data?.[0]?.data;
        if (!record) return jsonResponse(404, { error: 'Not found' });
        if (fields && fields.length) {
          const lean = {};
          for (const k of fields) if (k in record) lean[k] = record[k];
          return jsonResponse(200, lean);
        }
        return jsonResponse(200, record);
      }

      if (url.searchParams.has('category')) {
        query = query.filter('data->>category', 'eq', url.searchParams.get('category'));
      }

      if (limitParam && Number.isFinite(limit) && limit > 0) {
        query = query.limit(limit);
      }

      const { data, error } = await query;
      if (error) return jsonResponse(500, { error: error.message });
      const rows = (data ?? []).map((row) => row.data);
      if (fields && fields.length) {
        const leanRows = rows.map((r) => {
          const o = {};
          for (const k of fields) if (k in r) o[k] = r[k];
          return o;
        });
        return jsonResponse(200, leanRows);
      }
      return jsonResponse(200, rows);
    }

    if (method === 'POST') {
      if (!payload || typeof payload !== 'object') {
        return jsonResponse(400, { error: 'Missing request body' });
      }
      let recordId = payload.id ?? payload.external_id ?? payload?.data?.id ?? null;
      if (!recordId) recordId = randomUUID();
      const normalizedId = String(recordId);
      const record = {
        collection,
        external_id: normalizedId,
        data: { ...payload, id: normalizedId }
      };
      const { data, error } = await supabase
        .from('data_store')
        .upsert([record], { onConflict: 'collection,external_id' })
        .select('data,external_id');
      if (error) return jsonResponse(500, { error: error.message });
      const saved = (data ?? [])[0]?.data ?? record.data;
      return jsonResponse(201, saved);
    }

    if (method === 'PUT' || method === 'PATCH') {
      if (!payload || typeof payload !== 'object') {
        return jsonResponse(400, { error: 'Missing request body' });
      }
      const recordId = resourceId || payload.id || payload.external_id;
      if (!recordId) {
        return jsonResponse(400, { error: 'Missing id for update' });
      }
      const normalizedId = String(recordId);
      const record = {
        collection,
        external_id: normalizedId,
        data: { ...payload, id: normalizedId }
      };
      const { data, error } = await supabase
        .from('data_store')
        .upsert([record], { onConflict: 'collection,external_id' })
        .select('data,external_id');
      if (error) return jsonResponse(500, { error: error.message });
      const saved = (data ?? [])[0]?.data ?? record.data;
      return jsonResponse(200, saved);
    }

    if (method === 'DELETE') {
      const recordId = resourceId || payload?.id || payload?.external_id;
      if (!recordId) {
        return jsonResponse(400, { error: 'Missing id for delete' });
      }
      const { error } = await supabase
        .from('data_store')
        .delete()
        .eq('collection', collection)
        .eq('external_id', String(recordId));
      if (error) return jsonResponse(500, { error: error.message });
      return jsonResponse(200, { success: true });
    }

    return jsonResponse(405, { error: `Method ${method} not allowed` });
  } catch (err) {
    return jsonResponse(500, { error: String(err) });
  }
}
