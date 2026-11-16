import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const localRedisClient = require('../lib/localRedis');
const AuthService = require('../services/authService');
const authEmailThrottle = require('../services/authEmailThrottle');
const { PASSWORD_MIN_LENGTH } = require('../lib/passwordPolicy');
const authRoutes = require('./auth');

async function registerRoutes() {
  const routes = new Map();
  const capture = (method) => (path, options, handler) => {
    routes.set(`${method} ${path}`, { options, handler: handler || options });
  };
  await authRoutes({ register: async () => {}, get: capture('GET'), post: capture('POST') });
  return routes;
}

function reply() {
  return {
    status: 200,
    headers: {},
    code(code) { this.status = code; return this; },
    header(name, value) { this.headers[name] = value; return this; },
    send(body) { this.body = body; return this; },
  };
}

function request(body) {
  return { body, headers: {}, log: { error: vi.fn() } };
}

const never = () => new Promise(() => {});

describe('unauthenticated account endpoints', () => {
  let routes;

  beforeEach(async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(false);
    authEmailThrottle.__resetMemoryStore();
    routes = await registerRoutes();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['POST /auth/register', 10, 60 * 60 * 1000],
    ['POST /auth/forgot-password', 20, 60 * 60 * 1000],
    ['POST /auth/resend-verification', 20, 60 * 60 * 1000],
    ['POST /auth/reset-password', 10, 60 * 1000],
    ['POST /auth/verify-email', 10, 60 * 1000],
  ])('%s has its own per-IP limit of %i requests', (route, max, timeWindow) => {
    expect(routes.get(route).options.config.rateLimit).toEqual({ max, timeWindow });
  });

  it('requires the shared minimum length wherever a password is set', () => {
    const password = (route) => routes.get(route).options.schema.body.properties.password;

    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(password('POST /auth/register').minLength).toBe(PASSWORD_MIN_LENGTH);
    expect(password('POST /auth/reset-password').minLength).toBe(PASSWORD_MIN_LENGTH);
    expect(password('POST /auth/invitations/accept').minLength).toBe(PASSWORD_MIN_LENGTH);
  });

  it('answers a password reset request without waiting for the account lookup or e-mail', async () => {
    const forgotPassword = vi.spyOn(AuthService.prototype, 'forgotPassword').mockImplementation(never);
    const response = reply();

    await routes.get('POST /auth/forgot-password').handler(request({ email: 'person@example.com' }), response);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Password reset email sent successfully' });
    await Promise.resolve();
    expect(forgotPassword).toHaveBeenCalledWith('person@example.com', expect.anything());
  });

  it('gives the same reset response when the background work fails', async () => {
    vi.spyOn(AuthService.prototype, 'forgotPassword').mockRejectedValue(new Error('smtp down'));
    const incoming = request({ email: 'person@example.com' });
    const response = reply();

    await routes.get('POST /auth/forgot-password').handler(incoming, response);
    await new Promise((resolve) => setImmediate(resolve));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Password reset email sent successfully' });
    expect(incoming.log.error).toHaveBeenCalledTimes(1);
  });

  it('returns one resend-verification response for unknown, verified and unverified addresses', async () => {
    const outcomes = [
      () => Promise.resolve({ message: 'Doğrulama e-postası gönderildi' }),
      () => Promise.reject(new Error('E-posta adresi zaten doğrulanmış')),
      () => Promise.resolve({ message: 'Eğer bu e-posta adresi kayıtlıysa, doğrulama bağlantısı gönderilecektir' }),
    ];
    const resend = vi.spyOn(AuthService.prototype, 'resendVerificationEmail');
    const bodies = [];

    for (const [index, outcome] of outcomes.entries()) {
      resend.mockImplementationOnce(outcome);
      const response = reply();
      await routes.get('POST /auth/resend-verification').handler(request({ email: `person-${index}@example.com` }), response);
      await new Promise((resolve) => setImmediate(resolve));
      expect(response.status).toBe(200);
      bodies.push(JSON.stringify(response.body));
    }

    expect(new Set(bodies).size).toBe(1);
  });

  it.each([
    ['POST /auth/forgot-password', 'forgotPassword'],
    ['POST /auth/resend-verification', 'resendVerificationEmail'],
  ])('%s stops e-mailing one address after the allowance, whichever client asks', async (route, method) => {
    const work = vi.spyOn(AuthService.prototype, method).mockResolvedValue(undefined);
    const { handler } = routes.get(route);

    for (let attempt = 1; attempt <= authEmailThrottle.MAX_PER_WINDOW; attempt += 1) {
      const allowed = reply();
      await handler(request({ email: 'victim@example.com' }), allowed);
      expect(allowed.status).toBe(200);
    }

    const blocked = reply();
    await handler(request({ email: 'Victim@Example.com' }), blocked);
    await Promise.resolve();

    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({ error: 'RateLimitExceeded', statusCode: 429 });
    expect(blocked.headers['Retry-After']).toBe(blocked.body.retryAfter);
    expect(blocked.body.retryAfter).toBeGreaterThan(0);
    expect(work).toHaveBeenCalledTimes(authEmailThrottle.MAX_PER_WINDOW);
  });
});
