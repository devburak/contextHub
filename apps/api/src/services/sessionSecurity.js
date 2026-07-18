const crypto = require('crypto');
const { getAdminOrigins, normalizeOrigin } = require('./tenantOriginPolicy');

const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '24h';
const DEFAULT_SESSION_COOKIE = process.env.NODE_ENV === 'production'
  ? '__Host-ctx_session'
  : 'ctx_session';

function getSessionCookieName() {
  const configured = String(process.env.AUTH_SESSION_COOKIE_NAME || '').trim();
  if (!configured) {
    return DEFAULT_SESSION_COOKIE;
  }

  if (process.env.NODE_ENV === 'production' && !configured.startsWith('__Host-')) {
    throw new Error('AUTH_SESSION_COOKIE_NAME must use the __Host- prefix in production');
  }

  return configured;
}

function parseCookies(header = '') {
  return String(header)
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf('=');
      if (separator <= 0) {
        return cookies;
      }

      const key = part.slice(0, separator).trim();
      const rawValue = part.slice(separator + 1).trim();
      try {
        cookies[key] = decodeURIComponent(rawValue);
      } catch {
        cookies[key] = rawValue;
      }
      return cookies;
    }, {});
}

function getSessionToken(request) {
  const cookies = parseCookies(request.headers.cookie);
  const token = cookies[getSessionCookieName()];
  return token
    ? { token, source: 'cookie' }
    : { token: null, source: null };
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  parts.push(`Path=${options.path || '/'}`);
  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }
  if (options.secure) {
    parts.push('Secure');
  }
  parts.push(`SameSite=${options.sameSite || 'Strict'}`);

  return parts.join('; ');
}

function setSessionCookie(reply, token) {
  const production = process.env.NODE_ENV === 'production';
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('Set-Cookie', serializeCookie(getSessionCookieName(), token, {
    httpOnly: true,
    secure: production,
    sameSite: process.env.AUTH_COOKIE_SAME_SITE || 'Strict',
    path: '/',
  }));
}

function clearSessionCookie(reply) {
  const production = process.env.NODE_ENV === 'production';
  reply.header('Cache-Control', 'no-store');
  reply.header('Pragma', 'no-cache');
  reply.header('Set-Cookie', serializeCookie(getSessionCookieName(), '', {
    httpOnly: true,
    secure: production,
    sameSite: process.env.AUTH_COOKIE_SAME_SITE || 'Strict',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  }));
}

function isUnsafeMethod(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
}

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function enforceCookieCsrf(request, reply, decodedPayload) {
  if (request.authSource !== 'cookie' || !isUnsafeMethod(request.method)) {
    return true;
  }

  const origin = normalizeOrigin(request.headers.origin);
  const trustedOrigins = getAdminOrigins();
  if (!origin || !trustedOrigins.has(origin)) {
    reply.code(403).send({
      error: 'InvalidOrigin',
      message: 'Request origin is not allowed',
    });
    return false;
  }

  const csrfHeader = request.headers['x-csrf-token'];
  if (!csrfHeader || !decodedPayload?.csrf || !timingSafeEqual(csrfHeader, decodedPayload.csrf)) {
    reply.code(403).send({
      error: 'InvalidCsrfToken',
      message: 'CSRF token is missing or invalid',
    });
    return false;
  }

  return true;
}

function issueSessionToken(fastify, {
  user,
  tenantId = null,
  role = null,
  roleId = null,
  permissions = [],
  authAt = Math.floor(Date.now() / 1000),
}) {
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const jti = crypto.randomBytes(16).toString('hex');
  const token = fastify.jwt.sign({
    sub: user._id?.toString?.() || user.id?.toString?.(),
    email: user.email,
    tokenVersion: user.tokenVersion ?? 0,
    role,
    roleId,
    tenantId,
    permissions,
    jti,
    csrf: csrfToken,
    authAt,
  }, { expiresIn: TOKEN_TTL });

  return { token, csrfToken, jti };
}

module.exports = {
  TOKEN_TTL,
  getSessionCookieName,
  getSessionToken,
  setSessionCookie,
  clearSessionCookie,
  enforceCookieCsrf,
  issueSessionToken,
};
