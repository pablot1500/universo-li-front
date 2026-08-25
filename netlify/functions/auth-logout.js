import {
  authJsonHeaders,
  buildExpiredSessionCookie
} from './_shared/auth.js';

const jsonResponse = (statusCode, payload, headers = {}) => ({
  statusCode,
  headers: { ...authJsonHeaders, ...headers },
  body: JSON.stringify(payload)
});

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: authJsonHeaders };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  return jsonResponse(200, { ok: true }, {
    'Set-Cookie': buildExpiredSessionCookie()
  });
}
