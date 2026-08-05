import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const AuthService = require('./services/authService');
const TEST_R2_ENV = {
  R2_BUCKET: 'test-media-bucket',
  R2_PUBLIC_DOMAIN: 'https://media.example.test',
  R2_S3_ENDPOINT: 'https://r2.example.test',
  R2_ACCESS_KEY: 'test-access-key',
  R2_SECRET_KEY: 'test-secret-key',
};
const originalR2Env = new Map(
  Object.keys(TEST_R2_ENV).map((key) => [key, process.env[key]])
);

describe('API server', () => {
  let app;
  let originalLogin;

  beforeAll(async () => {
    Object.assign(process.env, TEST_R2_ENV);
    const { default: buildServer } = await import('./server.js');

    originalLogin = AuthService.prototype.login;
    AuthService.prototype.login = async function mockLogin(email, password, tenantId) {
      if (email === 'test@example.com' && password === '123456') {
        const activeMembership = tenantId
          ? {
              id: 'membership-1',
              tenantId,
              tenant: { id: tenantId, name: 'Test Tenant', slug: 'test-tenant' },
              role: 'admin',
              roleMeta: null,
              permissions: [],
              status: 'active',
            }
          : null;
        return {
          token: 'mock-token',
          csrfToken: 'mock-csrf-token',
          user: {
            id: 'user-1',
            email,
            firstName: 'Test',
            lastName: 'User',
            role: activeMembership?.role || null,
            permissions: []
          },
          memberships: [],
          requiresTenantSelection: !activeMembership,
          message: 'ok',
          activeMembership
        };
      }
      throw new Error('Invalid credentials');
    };
    app = await buildServer({
      pluginEntries: [
        path.resolve(
          process.cwd(),
          'src/lib/__fixtures__/dummy-plugin/plugin.manifest.json'
        )
      ]
    });
  });
  afterAll(async () => {
    if (app) await app.close();
    if (originalLogin) AuthService.prototype.login = originalLogin;

    for (const [key, value] of originalR2Env) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('returns ok from /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('boots configured API extensions under their declared prefix', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/dummy/ping' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({
      ok: true,
      plugin: 'dummy',
      apiVersion: 1,
      apiRevision: 4
    });
  });

  it('creates a tenant-selection session when tenantId is omitted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.requiresTenantSelection).toBe(true);
    expect(body).not.toHaveProperty('token');
    expect(body.csrfToken).toBe('mock-csrf-token');
  });

  it('sets an HttpOnly cookie and does not expose the session JWT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login?tenantId=mock-tenant-id',
      payload: { email: 'test@example.com', password: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).not.toHaveProperty('token');
    expect(body.csrfToken).toBe('mock-csrf-token');
    expect(body).toHaveProperty('user');
    expect(body.user.email).toBe('test@example.com');
    expect(res.headers['set-cookie']).toContain('ctx_session=mock-token');
    expect(res.headers['set-cookie']).toContain('HttpOnly');
    expect(res.headers['set-cookie']).toContain('SameSite=Strict');
  });
});
