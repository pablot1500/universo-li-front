export const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (!Number.isFinite(ms) || ms <= 0) {
    resolve();
    return;
  }

  const timeoutId = setTimeout(() => {
    cleanup();
    resolve();
  }, ms);

  const onAbort = () => {
    cleanup();
    const error = new Error('Fetch is aborted');
    error.name = 'AbortError';
    reject(error);
  };

  const cleanup = () => {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  };

  if (signal) {
    if (signal.aborted) {
      cleanup();
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
});

const parseJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export const fetchCasanachoPrice = async (
  scraperEndpoint,
  link,
  { signal, maxRetries = 2 } = {}
) => {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(
      `${scraperEndpoint}?url=${encodeURIComponent(link)}`,
      { signal }
    );
    const data = await parseJsonSafe(response);

    if (response.ok) {
      const price = Number(data?.price);
      if (!Number.isFinite(price)) {
        const error = new Error('El scraper no devolvió un precio válido');
        error.status = response.status;
        error.payload = data;
        throw error;
      }
      return { price, meta: data };
    }

    const retryAfterMs = Number(data?.retryAfterMs);
    const message = data?.error || data?.detail || 'Respuesta no OK del scraper';
    const isRateLimited = response.status === 429;
    if (isRateLimited && attempt < maxRetries) {
      await sleep(
        Number.isFinite(retryAfterMs) && retryAfterMs > 0
          ? retryAfterMs
          : 5000 * (attempt + 1),
        signal
      );
      continue;
    }

    const error = new Error(message);
    error.status = response.status;
    error.payload = data;
    lastError = error;
    break;
  }

  throw lastError || new Error('No se pudo obtener el precio');
};
