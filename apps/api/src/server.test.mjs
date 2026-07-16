import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import buildServer from './server.js';

const require = createRequire(import.meta.url);
const AuthService = require('./services/authService');

describe('API server', () => {
  let app;
  let originalLogin;

  beforeAll(async () => {
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
    app = await buildServer();
  });
  afterAll(async () => {
    await app.close();
    AuthService.prototype.login = originalLogin;
  });

  it('returns ok from /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
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
