import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  enforceCookieCsrf,
  getSessionToken,
  setSessionCookie,
} = require('./sessionSecurity');

const originalTrustedOrigins = process.env.AUTH_TRUSTED_ORIGINS;
const originalCorsOrigin = process.env.CORS_ORIGIN;

afterEach(() => {
  if (originalTrustedOrigins === undefined) delete process.env.AUTH_TRUSTED_ORIGINS;
  else process.env.AUTH_TRUSTED_ORIGINS = originalTrustedOrigins;
  if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
  else process.env.CORS_ORIGIN = originalCorsOrigin;
});

function createReply() {
  const headers = {};
  return {
    statusCode: 200,
    payload: null,
    headers,
    header(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    code(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('sessionSecurity', () => {
  it('writes an HttpOnly SameSite session cookie', () => {
    const reply = createReply();
    setSessionCookie(reply, 'signed.jwt.value');

    expect(reply.headers['set-cookie']).toContain('ctx_session=signed.jwt.value');
    expect(reply.headers['set-cookie']).toContain('HttpOnly');
    expect(reply.headers['set-cookie']).toContain('SameSite=Strict');
    expect(reply.headers['set-cookie']).toContain('Path=/');
  });

  it('reads browser sessions from the cookie and keeps ctx_ tokens separate', () => {
    const cookieRequest = {
      headers: { cookie: 'ctx_session=cookie-jwt; theme=dark' },
    };
    expect(getSessionToken(cookieRequest)).toEqual({
      token: 'cookie-jwt',
      source: 'cookie',
    });

    const apiTokenRequest = {
      headers: {
        authorization: 'Bearer ctx_external_api_token',
        cookie: 'ctx_session=cookie-jwt',
      },
    };
    expect(getSessionToken(apiTokenRequest)).toEqual({
      token: 'cookie-jwt',
      source: 'cookie',
    });

    const legacyJwtRequest = {
      headers: { authorization: 'Bearer legacy-browser-jwt' },
    };
    expect(getSessionToken(legacyJwtRequest)).toEqual({
      token: null,
      source: null,
    });
  });

  it('requires both a trusted origin and matching CSRF token for unsafe cookie requests', () => {
    const validReply = createReply();
    const validRequest = {
      method: 'POST',
      authSource: 'cookie',
      headers: {
        origin: 'http://localhost:3100',
        'x-csrf-token': 'csrf-value',
      },
    };
    expect(enforceCookieCsrf(validRequest, validReply, { csrf: 'csrf-value' })).toBe(true);

    const invalidReply = createReply();
    const invalidRequest = {
      method: 'POST',
      authSource: 'cookie',
      headers: {
        origin: 'https://attacker.example',
        'x-csrf-token': 'csrf-value',
      },
    };
    expect(enforceCookieCsrf(invalidRequest, invalidReply, { csrf: 'csrf-value' })).toBe(false);
    expect(invalidReply.statusCode).toBe(403);
    expect(invalidReply.payload.error).toBe('InvalidOrigin');
  });

  it('does not treat tenant public CORS origins as admin CSRF origins', () => {
    process.env.AUTH_TRUSTED_ORIGINS = 'https://admin.ctxhub.example';
    process.env.CORS_ORIGIN = 'https://tenant-public.example';

    const reply = createReply();
    const request = {
      method: 'POST',
      authSource: 'cookie',
      headers: {
        origin: 'https://tenant-public.example',
        'x-csrf-token': 'csrf-value',
      },
    };

    expect(enforceCookieCsrf(request, reply, { csrf: 'csrf-value' })).toBe(false);
    expect(reply.payload.error).toBe('InvalidOrigin');
  });
});
