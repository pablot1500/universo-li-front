import { createHmac, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIE_NAME = 'uli_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const authJsonHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'Netlify-CDN-Cache-Control': 'no-store'
};

const base64UrlEncode = (value) => Buffer
  .from(value)
  .toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

const base64UrlDecode = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
};

const getSessionSecret = () => process.env.APP_SESSION_SECRET || '';

const signPayload = (payload) => createHmac('sha256', getSessionSecret())
  .update(payload)
  .digest('base64url');

const safeEqual = (a, b) => {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
};

export const parseCookieHeader = (cookieHeader = '') => {
  const cookies = new Map();
  String(cookieHeader)
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return;
      const name = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (name) cookies.set(name, decodeURIComponent(value));
    });
  return cookies;
};

export const createSessionToken = (username) => {
  if (!getSessionSecret()) {
    throw new Error('APP_SESSION_SECRET is not configured');
  }
  const payload = base64UrlEncode(JSON.stringify({
    sub: username,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS
  }));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
};

export const validateSessionToken = (token) => {
  if (!token || !getSessionSecret()) return false;
  const [payload, signature] = String(token).split('.');
  if (!payload || !signature) return false;
  if (!safeEqual(signature, signPayload(payload))) return false;

  try {
    const session = JSON.parse(base64UrlDecode(payload));
    return Number(session.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
};

export const getSessionTokenFromEvent = (event) => {
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie || '';
  return parseCookieHeader(cookieHeader).get(AUTH_COOKIE_NAME) || '';
};

export const getSessionTokenFromRequest = (request) => {
  return parseCookieHeader(request.headers.get('cookie') || '').get(AUTH_COOKIE_NAME) || '';
};

export const isAuthorizedEvent = (event) => validateSessionToken(getSessionTokenFromEvent(event));
export const isAuthorizedRequest = (request) => validateSessionToken(getSessionTokenFromRequest(request));

export const unauthorizedResponse = () => ({
  statusCode: 401,
  headers: authJsonHeaders,
  body: JSON.stringify({ ok: false, error: 'Unauthorized' })
});

export const unauthorizedFetchResponse = () => new Response(
  JSON.stringify({ ok: false, error: 'Unauthorized' }),
  { status: 401, headers: authJsonHeaders }
);

export const buildSessionCookie = (token) => [
  `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
  'Path=/',
  `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  'HttpOnly',
  'Secure',
  'SameSite=Lax'
].join('; ');

export const buildExpiredSessionCookie = () => [
  `${AUTH_COOKIE_NAME}=`,
  'Path=/',
  'Max-Age=0',
  'HttpOnly',
  'Secure',
  'SameSite=Lax'
].join('; ');
