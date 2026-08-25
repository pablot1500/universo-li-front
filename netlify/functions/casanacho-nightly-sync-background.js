import { runNightlySync } from './_shared/casanacho-nightly-sync.js';

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const result = await runNightlySync({
      triggerSource: body?.triggerSource || request.headers.get('x-nightly-sync-origin') || 'manual'
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error running Casanacho nightly sync:', error);
    return new Response(JSON.stringify({
      ok: false,
      error: error.message || String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
