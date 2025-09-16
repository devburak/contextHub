import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import buildServer from './server.js';

describe('API server', () => {
  let app;

  beforeAll(async () => {
    app = await buildServer();
  });
  afterAll(async () => {
    await app.close();
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
