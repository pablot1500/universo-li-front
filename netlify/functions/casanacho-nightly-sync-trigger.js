import { triggerNightlySync } from './_shared/casanacho-nightly-sync.js';
import { isAuthorizedRequest, unauthorizedFetchResponse } from './_shared/auth.js';

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!isAuthorizedRequest(request)) {
    return unauthorizedFetchResponse();
  }

  try {
    const result = await triggerNightlySync({ triggerSource: 'manual', force: true });
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message || String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
