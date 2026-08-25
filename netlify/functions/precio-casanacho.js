import { getCasanachoPrice } from './_shared/casanacho-price.js';
import { isAuthorizedEvent, unauthorizedResponse } from './_shared/auth.js';

const defaultHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'no-store'
};

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: defaultHeaders,
  body: JSON.stringify(payload)
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: defaultHeaders };
  }

  if (!isAuthorizedEvent(event)) {
    return unauthorizedResponse();
  }

  try {
    const url = event.queryStringParameters?.url || new URL(event.rawUrl).searchParams.get('url');
    if (!url) {
      return jsonResponse(400, { error: 'Missing "url" query parameter' });
    }
    const result = await getCasanachoPrice(url);
    if (result.ok) {
      return jsonResponse(200, {
        price: result.price,
        cached: result.cached === true,
        stale: result.stale === true
      });
    }
    return jsonResponse(result.status || 500, {
      error: result.error || 'Unable to fetch price',
      detail: result.detail,
      retryAfterMs: result.retryAfterMs
    });
  } catch (err) {
    console.error('Error scraping Casanacho price:', err);
    return jsonResponse(500, { error: 'Unable to fetch price', detail: err.message || String(err) });
  }
}
