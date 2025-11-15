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
      if (tenantId && email === 'test@example.com' && password === '123456') {
        return {
          token: 'mock-token',
          user: {
            id: 'user-1',
            email,
            firstName: 'Test',
            lastName: 'User',
            role: 'admin',
            permissions: []
          },
          memberships: [],
          requiresTenantSelection: false,
          message: 'ok',
          activeMembership: null
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
  });

  it('requires tenantId for login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'test@example.com', password: '123456' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns a token for valid login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login?tenantId=mock-tenant-id',
      payload: { email: 'test@example.com', password: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body).toHaveProperty('token');
    expect(typeof body.token).toBe('string');
    expect(body).toHaveProperty('user');
    expect(body.user.email).toBe('test@example.com');
  });
});
