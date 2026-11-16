import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const { User } = require('@contexthub/common');
const ActivityLog = require('@contexthub/common/src/models/ActivityLog');
const AuthService = require('./services/authService');
const { mailService } = require('./services/mailService');
const localRedisClient = require('./lib/localRedis');
const authEmailThrottle = require('./services/authEmailThrottle');

const TEST_ENV = {
  R2_BUCKET: 'test-media-bucket',
  R2_PUBLIC_DOMAIN: 'https://media.example.test',
  R2_S3_ENDPOINT: 'https://r2.example.test',
  R2_ACCESS_KEY: 'test-access-key',
  R2_SECRET_KEY: 'test-secret-key',
};
const originalEnv = new Map(Object.keys(TEST_ENV).map((key) => [key, process.env[key]]));

class TestRateLimitStore {
  constructor(options = {}) {
    this.timeWindow = options.timeWindow;
    this.counters = new Map();
  }

  incr(key, callback, max, ban) {
    const current = (this.counters.get(key) || 0) + 1;
    this.counters.set(key, current);
    callback(null, { current, ttl: this.timeWindow, ban: ban !== -1 && current - max > ban });
  }

  child(options) {
    return new TestRateLimitStore(options);
  }
}

const post = (app, url, payload) => app.inject({ method: 'POST', url, payload });

// Each route keeps its own per-IP counter for the lifetime of the app, so every
// route is exercised by exactly one test below.
describe('account endpoints through the running API', () => {
  let app;

  beforeAll(async () => {
    Object.assign(process.env, TEST_ENV);
    const { default: buildServer } = await import('./server.js');
    app = await buildServer({ readinessCheck: () => true, rateLimitStore: TestRateLimitStore });
    await app.ready();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    authEmailThrottle.__resetMemoryStore();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('cuts off token guessing on verify-email after ten attempts a minute', async () => {
    vi.spyOn(ActivityLog, 'create').mockResolvedValue({});
    const findOne = vi.spyOn(User, 'findOne').mockResolvedValue(null);
    const find = vi.spyOn(User, 'find');

    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const response = await post(app, '/api/auth/verify-email', { token: crypto.randomBytes(32).toString('hex') });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('EmailVerificationFailed');
    }
    const blocked = await post(app, '/api/auth/verify-email', { token: crypto.randomBytes(32).toString('hex') });

    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: 'RateLimitExceeded' });
    // One indexed lookup per accepted attempt, none for the rejected one.
    expect(findOne).toHaveBeenCalledTimes(10);
    expect(find).not.toHaveBeenCalled();
  });

  it('resets a password with the e-mailed token and rejects short passwords and unknown tokens', async () => {
    vi.spyOn(ActivityLog, 'create').mockResolvedValue({});
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = {
      _id: 'user-1', email: 'person@example.com', firstName: 'Per', lastName: 'Son', tokenVersion: 0,
      save: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(User, 'findOne').mockImplementation(async (query) => (query.resetPasswordToken === tokenHash ? user : null));
    const notify = vi.spyOn(mailService, 'sendPasswordChangeEmail').mockResolvedValue(true);

    const tooShort = await post(app, '/api/auth/reset-password', { token, password: '1234567' });
    expect(tooShort.statusCode).toBe(400);
    expect(user.save).not.toHaveBeenCalled();

    const unknown = await post(app, '/api/auth/reset-password', {
      token: crypto.randomBytes(32).toString('hex'),
      password: 'long-enough-password',
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error).toBe('PasswordResetFailed');

    const accepted = await post(app, '/api/auth/reset-password', { token, password: 'long-enough-password' });
    expect(accepted.statusCode).toBe(200);
    expect(user.password).toBe('long-enough-password');
    expect(user.resetPasswordToken).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('answers forgot-password identically and stops after three e-mails to one address', async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(false);
    const forgotPassword = vi.spyOn(AuthService.prototype, 'forgotPassword').mockResolvedValue(undefined);
    const bodies = new Set();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await post(app, '/api/auth/forgot-password', { email: 'victim@example.com' });
      expect(response.statusCode).toBe(200);
      bodies.add(response.payload);
    }
    const blocked = await post(app, '/api/auth/forgot-password', { email: 'victim@example.com' });

    expect(bodies.size).toBe(1);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: 'RateLimitExceeded' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(forgotPassword).toHaveBeenCalledTimes(3);
  });

  it('refuses registration with a password shorter than eight characters', async () => {
    const register = vi.spyOn(AuthService.prototype, 'register');

    const response = await post(app, '/api/auth/register', {
      email: 'new@example.com', password: '1234567', firstName: 'New', lastName: 'User',
    });

    expect(response.statusCode).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });
});
