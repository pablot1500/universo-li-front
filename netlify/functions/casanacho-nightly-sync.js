import { triggerNightlySync } from './_shared/casanacho-nightly-sync.js';

export const config = {
  // UTC. En Argentina (UTC-3) corre cada 5 minutos entre 02:00 y 06:55.
  // Esto permite retomar retry-wait/partial durante la noche sin depender de la UI.
  schedule: '*/5 5-9 * * *'
};

export default async () => {
  try {
    const result = await triggerNightlySync({ triggerSource: 'scheduled', force: false });
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
