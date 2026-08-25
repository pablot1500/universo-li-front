// netlify/functions/api.js
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { isAuthorizedEvent, unauthorizedResponse } from './_shared/auth.js';

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

const productCacheHeaders = {
  'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
  'Netlify-CDN-Cache-Control': 'no-store'
};

const jsonResponse = (statusCode, payload, headers = {}) => ({
  statusCode,
  headers: { ...defaultHeaders, ...headers },
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

const PRODUCT_SUMMARY_SELECT = [
  'external_id',
  'id:data->>id',
  'name:data->>name',
  'category:data->>category',
  'type:data->>type',
  'featured:data->featured',
  'price:data->price',
  'posX:data->posX',
  'posY:data->posY',
  'componentes:data->componentes',
  'costoConfeccion:data->costoConfeccion',
  'priceAdjustments:data->priceAdjustments',
  'pricing:data->pricing',
  'modificadores:data->modificadores',
  'compositeItems:data->compositeItems'
].join(',');

const PRODUCT_THUMBNAIL_SELECT = [
  'external_id',
  'image:data->>image',
  'posX:data->posX',
  'posY:data->posY'
].join(',');

const normalizeProductSummary = (row) => ({
  ...row,
  id: row.id || row.external_id,
  type: row.type || 'simple',
  category: row.category || '',
  featured: row.featured === true || row.featured === 'true',
  price: Number.isFinite(Number(row.price)) ? Number(row.price) : row.price,
  posX: Number.isFinite(Number(row.posX)) ? Number(row.posX) : row.posX,
  posY: Number.isFinite(Number(row.posY)) ? Number(row.posY) : row.posY
});

const matchesSearch = (row, search) => {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [row.name, row.category]
    .some(value => String(value || '').toLowerCase().includes(needle));
};

const listProductCategories = async () => {
  const { data, error } = await supabase
    .from('data_store')
    .select('category:data->>category')
    .eq('collection', 'products');
  if (error) return { error };

  const counts = new Map();
  (data ?? []).forEach((row) => {
    const category = row.category || 'Sin categoría';
    counts.set(category, (counts.get(category) || 0) + 1);
  });

  return {
    data: Array.from(counts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category))
  };
};

const listProductSummaries = async ({ category, featured, search, page, limit, fields }) => {
  const pageSize = Number.isFinite(limit) && limit > 0 ? limit : 25;
  const pageNumber = Number.isFinite(page) && page > 0 ? page : 1;

  let query = supabase
    .from('data_store')
    .select(PRODUCT_SUMMARY_SELECT, { count: 'exact' })
    .eq('collection', 'products');

  if (category) {
    query = query.filter('data->>category', 'eq', category);
  }

  if (featured) {
    query = query.filter('data->>featured', 'eq', 'true');
  }

  query = query.order('external_id', { ascending: true });

  if (!search) {
    const from = (pageNumber - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;
  if (error) return { error };

  let rows = (data ?? []).map(normalizeProductSummary).filter(row => matchesSearch(row, search));
  const total = search ? rows.length : (count ?? rows.length);

  if (search) {
    const from = (pageNumber - 1) * pageSize;
    rows = rows.slice(from, from + pageSize);
  }

  if (fields && fields.length) {
    rows = rows.map((row) => {
      const lean = {};
      for (const k of fields) if (k in row) lean[k] = row[k];
      return lean;
    });
  }

  return {
    data: {
      items: rows,
      page: pageNumber,
      limit: pageSize,
      total,
      hasMore: pageNumber * pageSize < total
    }
  };
};

const listProductThumbnails = async (idsParam) => {
  const ids = (idsParam || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .slice(0, 30);

  if (!ids.length) return { data: [] };

  const { data, error } = await supabase
    .from('data_store')
    .select(PRODUCT_THUMBNAIL_SELECT)
    .eq('collection', 'products')
    .in('external_id', ids);
  if (error) return { error };

  return {
    data: (data ?? []).map(row => ({
      id: row.external_id,
      image: row.image || '',
      posX: Number.isFinite(Number(row.posX)) ? Number(row.posX) : row.posX,
      posY: Number.isFinite(Number(row.posY)) ? Number(row.posY) : row.posY
    }))
  };
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

    if (!isAuthorizedEvent(event)) {
      return unauthorizedResponse();
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
    const action = pathSegments[1] || null;
    const collectionActions = new Set(['categories', 'thumbnails']);
    const resourceId = url.searchParams.get('id') || (collectionActions.has(action) ? null : action) || null;

    const limitParam = url.searchParams.get('limit');
    const pageParam = url.searchParams.get('page');
    const fieldsParam = (url.searchParams.get('fields') || '').trim();
    const fields = fieldsParam
      ? fieldsParam.split(',').map(s => s.trim()).filter(Boolean)
      : null;
    const limit = Number(limitParam);
    const page = Number(pageParam);
    const hasLimit = Number.isFinite(limit) && limit > 0;
    const hasPage = Number.isFinite(page) && page > 0;
    const defaultPageSize = 25;
    const summary = url.searchParams.has('summary');
    const search = (url.searchParams.get('search') || '').trim();
    let payload = null;
    try {
      payload = decodeBody(event);
    } catch (err) {
      return jsonResponse(400, { error: 'Invalid JSON body', detail: err.message });
    }

    const method = (event.httpMethod || 'GET').toUpperCase();

    if (method === 'GET') {
      if (collection === 'products' && action === 'categories') {
        const { data, error } = await listProductCategories();
        if (error) return jsonResponse(500, { error: error.message });
        return jsonResponse(200, data, productCacheHeaders);
      }

      if (collection === 'products' && action === 'thumbnails') {
        const { data, error } = await listProductThumbnails(url.searchParams.get('ids'));
        if (error) return jsonResponse(500, { error: error.message });
        return jsonResponse(200, data, productCacheHeaders);
      }

      if (collection === 'products' && summary && !resourceId) {
        const { data, error } = await listProductSummaries({
          category: url.searchParams.get('category'),
          featured: url.searchParams.has('featured'),
          search,
          page,
          limit: hasLimit ? limit : defaultPageSize,
          fields
        });
        if (error) return jsonResponse(500, { error: error.message });
        return jsonResponse(200, data, productCacheHeaders);
      }

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

      query = query.order('external_id', { ascending: true });

      if (hasPage) {
        const pageSize = hasLimit ? limit : defaultPageSize;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to);
      } else if (hasLimit) {
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
      let nextData = { ...payload, id: normalizedId };
      if (method === 'PATCH') {
        const { data: existingRows, error: existingError } = await supabase
          .from('data_store')
          .select('data')
          .eq('collection', collection)
          .eq('external_id', normalizedId)
          .limit(1);
        if (existingError) return jsonResponse(500, { error: existingError.message });
        nextData = { ...(existingRows?.[0]?.data || {}), ...payload, id: normalizedId };
      }
      const record = {
        collection,
        external_id: normalizedId,
        data: nextData
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
