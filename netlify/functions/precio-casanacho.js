import axios from 'axios';
import * as cheerio from 'cheerio';

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

  try {
    const url = event.queryStringParameters?.url || new URL(event.rawUrl).searchParams.get('url');
    if (!url) {
      return jsonResponse(400, { error: 'Missing "url" query parameter' });
    }

    const response = await axios.get(url, {
      headers: {
        // set a basic user-agent to avoid being blocked
        'User-Agent': 'Mozilla/5.0 (compatible; UniversoLI/1.0; +https://universoli.netlify.app)'
      },
      timeout: 15000
    });

    const $ = cheerio.load(response.data);
    const priceString = $('#price_display').attr('data-product-price');
    if (!priceString) {
      return jsonResponse(404, { error: 'Price not found in HTML' });
    }

    const numeric = parseFloat(priceString);
    if (Number.isNaN(numeric)) {
      return jsonResponse(500, { error: 'Price value is not numeric' });
    }

    const price = numeric / 100;
    return jsonResponse(200, { price });
  } catch (err) {
    console.error('Error scraping Casanacho price:', err);
    return jsonResponse(500, { error: 'Unable to fetch price', detail: err.message || String(err) });
  }
}
