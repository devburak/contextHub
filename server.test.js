const { describe, it, expect, beforeAll } = require('vitest');
const buildServer = require('./server');

describe('API server', () => {
  let app;
  beforeAll(async () => {
    app = await buildServer();
  });

  it('should return OK on /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
  });

  it('should protect the /protected route', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
  });

  it('should allow access to /protected with a valid token', async () => {
    const loginRes = await app.inject({ method: 'POST', url: '/login', payload: { username: 'tester' } });
    const { token } = JSON.parse(loginRes.payload);
    const res = await app.inject({ method: 'GET', url: '/protected', headers: { Authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const { message } = JSON.parse(res.payload);
    expect(message).toContain('Hello tester');
  });
});