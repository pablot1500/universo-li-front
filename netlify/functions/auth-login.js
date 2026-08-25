import {
  authJsonHeaders,
  buildSessionCookie,
  createSessionToken
} from './_shared/auth.js';

const jsonResponse = (statusCode, payload, headers = {}) => ({
  statusCode,
  headers: { ...authJsonHeaders, ...headers },
  body: JSON.stringify(payload)
});

const readBody = (event) => {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return raw ? JSON.parse(raw) : {};
};

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: authJsonHeaders };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    const configuredUser = process.env.APP_LOGIN_USER || '';
    const configuredPassword = process.env.APP_LOGIN_PASSWORD || '';
    if (!configuredUser || !configuredPassword || !process.env.APP_SESSION_SECRET) {
      return jsonResponse(500, { ok: false, error: 'Auth is not configured' });
    }

    const { username, password } = readBody(event);
    const normalizedUsername = String(username || '').trim().toLowerCase();
    const normalizedConfiguredUser = configuredUser.trim().toLowerCase();
    if (normalizedUsername !== normalizedConfiguredUser || String(password || '') !== configuredPassword) {
      return jsonResponse(401, { ok: false, error: 'Usuario o clave incorrectos' });
    }

    const token = createSessionToken(configuredUser);
    return jsonResponse(200, { ok: true }, {
      'Set-Cookie': buildSessionCookie(token)
    });
  } catch (error) {
    return jsonResponse(400, { ok: false, error: error.message || 'Invalid request' });
  }
}
