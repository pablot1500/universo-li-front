import {
  authJsonHeaders,
  getSessionTokenFromEvent,
  validateSessionToken
} from './_shared/auth.js';

const jsonResponse = (statusCode, payload) => ({
  statusCode,
  headers: authJsonHeaders,
  body: JSON.stringify(payload)
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: authJsonHeaders };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  const token = getSessionTokenFromEvent(event);
  return jsonResponse(200, { ok: true, authenticated: validateSessionToken(token) });
}
