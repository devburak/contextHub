import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Fastify = require('fastify');
const jwt = require('@fastify/jwt');
const AuthService = require('../services/authService');
const mfa = require('../services/mfaService');
const { User } = require('@contexthub/common');
const { issueSessionToken } = require('../services/sessionSecurity');
const { sendPendingLogin } = require('../services/mfaCookie');
const google = require('../services/googleOAuth');
afterEach(() => vi.restoreAllMocks());
async function app() {
  const app = Fastify();
  await app.register(jwt, { secret: 'mfa-test-secret-long-enough-for-tests-only' });
  await app.register(require('./auth'));
  await app.ready();
  return app;
}
describe('MFA authentication boundary', () => {
  it('gates the central session issuer for both password and Google identities', async () => {
    const challenge = vi.spyOn(mfa, 'loginChallenge').mockResolvedValue({ token: 'pending', public: { mfaRequired: true } });
    const jwtSign = vi.fn(); const service = new AuthService({ jwt: { sign: jwtSign } });
    const user = { _id: 'user', status: 'active', mfa: { methods: ['totp'] } };
    for (const primaryAuth of ['password', 'google']) {
      const result = await service.completeLogin(user, null, null, { primaryAuth });
      expect(result).toEqual({ mfaRequired: true, challengeToken: 'pending' });
      expect(challenge).toHaveBeenLastCalledWith(user, null, primaryAuth);
    }
    expect(jwtSign).not.toHaveBeenCalled();
  });
  it('returns 202 with only a separate HttpOnly challenge cookie after primary login', async () => {
    const pending = 'p'.repeat(43);
    vi.spyOn(AuthService.prototype, 'login').mockResolvedValue({ mfaRequired: true, challengeToken: pending, methods: ['totp'], recoveryAvailable: true });
    const server = await app();
    try {
      const result = await server.inject({ method: 'POST', url: '/auth/login', payload: { email: 'user@example.test', password: 'correct-password' } });
      expect(result.statusCode).toBe(202);
      expect(result.json()).toMatchObject({ mfaRequired: true, methods: ['totp'] });
      expect(result.json()).not.toHaveProperty('token'); expect(result.json()).not.toHaveProperty('challengeToken'); expect(result.json()).not.toHaveProperty('csrfToken');
      const cookies = [result.headers['set-cookie']].flat();
      expect(cookies.find((item) => item.startsWith('ctx_mfa='))).toContain(`ctx_mfa=${pending}; Max-Age=300; Path=/; HttpOnly; SameSite=Strict`);
      expect(cookies.find((item) => item.startsWith('ctx_session='))).toContain('Max-Age=0');
    } finally { await server.close(); }
  });
  it('uses the same pending factor boundary after a successful Google callback', async () => {
    vi.spyOn(google, 'consume').mockResolvedValue({ data: { mode: 'signin' } });
    vi.spyOn(google, 'tokens').mockResolvedValue({ id_token: 'test-google-id' });
    vi.spyOn(google, 'identity').mockResolvedValue({ sub: 'subject', email: 'user@example.test' });
    vi.spyOn(User, 'findOne').mockResolvedValue({ _id: 'user', status: 'active' });
    const complete = vi.spyOn(AuthService.prototype, 'completeLogin').mockResolvedValue({ mfaRequired: true, challengeToken: 'g'.repeat(43), methods: ['email'] });
    const server = await app();
    try {
      const result = await server.inject({ url: '/auth/google/callback?code=fake' });
      expect(result.statusCode).toBe(302); expect(result.headers.location).toContain('/auth/login?mfa=1');
      expect(JSON.stringify(result.headers)).not.toContain('mock-session');
      expect(complete.mock.calls[0][3]).toEqual({ primaryAuth: 'google' });
      expect([result.headers['set-cookie']].flat().find((item) => item.startsWith('ctx_mfa='))).toBeTruthy();
    } finally { await server.close(); }
  });
  it('rejects pending-cookie verification from an untrusted or missing Origin', async () => {
    const verify = vi.spyOn(mfa, 'verifyLogin'); const server = await app();
    try {
      for (const origin of [undefined, 'https://evil.example']) {
        const result = await server.inject({ method: 'POST', url: '/auth/mfa/verify', headers: { cookie: `ctx_mfa=${'p'.repeat(43)}`, ...(origin ? { origin } : {}) }, payload: { method: 'email', code: '123456' } });
        expect(result.statusCode).toBe(403);
      }
      expect(verify).not.toHaveBeenCalled();
    } finally { await server.close(); }
  });
  it('issues the full session only after server-side factor verification and never exposes its JWT', async () => {
    vi.spyOn(mfa, 'verifyLogin').mockResolvedValue({ user: { _id: 'user' }, primaryAuth: 'google', mfaAt: 123 });
    const complete = vi.spyOn(AuthService.prototype, 'completeLogin').mockResolvedValue({ token: 'full-session-jwt', user: { id: 'user' }, csrfToken: 'csrf' });
    const server = await app();
    try {
      const result = await server.inject({ method: 'POST', url: '/auth/mfa/verify', headers: { origin: 'http://localhost:3100', cookie: `ctx_mfa=${'p'.repeat(43)}` }, payload: { method: 'email', code: '123456' } });
      expect(result.statusCode).toBe(200); expect(result.json()).not.toHaveProperty('token');
      expect([result.headers['set-cookie']].flat().join(';')).toContain('ctx_session=full-session-jwt');
      expect(complete.mock.calls[0][3]).toMatchObject({ mfaVerified: true, primaryAuth: 'google', mfaAt: 123 });
    } finally { await server.close(); }
  });
  it('retains primary and factor timestamps as signed session claims', () => {
    let claims; issueSessionToken({ jwt: { sign: (value) => { claims = value; return 'jwt'; } } }, { user: { id: 'user', email: 'user@example.test' }, primaryAuth: 'google', authAt: 100, mfaAt: 120 });
    expect(claims).toMatchObject({ primaryAuth: 'google', authAt: 100, mfaAt: 120 });
  });
  it('uses a Secure host-only cookie in production', () => {
    const old = process.env.NODE_ENV; process.env.NODE_ENV = 'production';
    const reply = { header: vi.fn().mockReturnThis(), code: vi.fn().mockReturnThis(), send: vi.fn() };
    try {
      sendPendingLogin(reply, { mfaRequired: true, challengeToken: 'test' });
      const cookies = reply.header.mock.calls.filter(([key]) => key === 'Set-Cookie').map(([, value]) => value);
      expect(cookies.at(-1)).toContain('__Host-ctx_mfa=test'); expect(cookies.at(-1)).toContain('Secure'); expect(cookies.at(-1)).not.toContain('Domain=');
    } finally { process.env.NODE_ENV = old; }
  });
});
