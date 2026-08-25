import axios from 'axios';
import * as cheerio from 'cheerio';

const CACHE_TTL_MS = 10 * 60 * 1000;
const MIN_UPSTREAM_INTERVAL_MS = 2500;
const RATE_LIMIT_RETRY_MS = 12000;
const MAX_RETRIES = 2;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const priceCache = new Map();
const pendingByUrl = new Map();
let upstreamQueue = Promise.resolve();
let lastUpstreamRequestAt = 0;

const normalizeUrl = (value) => {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
};

const enqueueUpstream = (task) => {
  const run = upstreamQueue.catch(() => undefined).then(task);
  upstreamQueue = run.catch(() => undefined);
  return run;
};

const parsePriceFromHtml = (html) => {
  const $ = cheerio.load(html);
  const priceString = $('#price_display').attr('data-product-price');
  if (!priceString) {
    return null;
  }
  const numeric = parseFloat(priceString);
  if (Number.isNaN(numeric)) {
    throw new Error('Price value is not numeric');
  }
  return numeric / 100;
};

const fetchPriceFromCasanacho = async (url) => {
  let lastRateLimit = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const waitMs = Math.max(0, lastUpstreamRequestAt + MIN_UPSTREAM_INTERVAL_MS - Date.now());
    if (waitMs > 0) {
      await sleep(waitMs);
    }
    lastUpstreamRequestAt = Date.now();

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; UniversoLI/1.0; +https://universoli.netlify.app)',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 15000,
      validateStatus: () => true
    });

    const challenged = response.headers?.['cf-mitigated'] === 'challenge';
    if (response.status === 429 || challenged) {
      lastRateLimit = {
        ok: false,
        status: 429,
        error: 'Casanacho bloqueó temporalmente el scraping (429 / Cloudflare).',
        detail: challenged
          ? 'Cloudflare devolvió un challenge. Conviene reintentar más tarde o usar el último valor cacheado.'
          : 'Too Many Requests',
        retryAfterMs: RATE_LIMIT_RETRY_MS
      };

      if (attempt < MAX_RETRIES) {
        await sleep(RATE_LIMIT_RETRY_MS * (attempt + 1));
        continue;
      }
      return lastRateLimit;
    }

    if (response.status < 200 || response.status >= 300) {
      return {
        ok: false,
        status: response.status,
        error: 'Unable to fetch price',
        detail: `HTTP ${response.status}`
      };
    }

    const price = parsePriceFromHtml(response.data);
    if (price == null) {
      return {
        ok: false,
        status: 404,
        error: 'Price not found in HTML'
      };
    }

    return { ok: true, price };
  }

  return {
    ok: false,
    ...(lastRateLimit || { status: 500, error: 'Unable to fetch price' })
  };
};

export const getCasanachoPrice = async (rawUrl) => {
  const normalizedUrl = normalizeUrl(rawUrl);
  const cached = priceCache.get(normalizedUrl);
  if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL_MS) {
    return { ok: true, price: cached.price, cached: true };
  }

  const pending = pendingByUrl.get(normalizedUrl);
  if (pending) {
    return pending;
  }

  const run = enqueueUpstream(async () => {
    const latestCached = priceCache.get(normalizedUrl);
    if (latestCached && (Date.now() - latestCached.fetchedAt) < CACHE_TTL_MS) {
      return { ok: true, price: latestCached.price, cached: true };
    }

    const result = await fetchPriceFromCasanacho(normalizedUrl);
    if (result.ok) {
      priceCache.set(normalizedUrl, { price: result.price, fetchedAt: Date.now() });
      return result;
    }

    const staleCache = priceCache.get(normalizedUrl);
    if (staleCache) {
      return {
        ok: true,
        price: staleCache.price,
        cached: true,
        stale: true
      };
    }

    return result;
  });

  pendingByUrl.set(normalizedUrl, run);
  try {
    return await run;
  } finally {
    pendingByUrl.delete(normalizedUrl);
  }
};
