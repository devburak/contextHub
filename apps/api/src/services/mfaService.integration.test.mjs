import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const require = createRequire(import.meta.url);
const { mongoose, User, AuthMfaChallenge } = require('@contexthub/common');
const { MfaService } = require('./mfaService');
const cipher = require('./mfaCrypto');
const OTPAuth = require('otpauth');
const bcrypt = require('bcryptjs');
const uri = process.env.MONGODB_TEST_URI;
const integration = describe.skipIf(!uri);
integration('MFA with isolated real MongoDB', () => {
  let service, user, clock, mailer, throttle;
  const password = 'valid-passphrase-1';
  const fresh = () => ({ authAt: Math.floor(clock / 1000), mfaAt: Math.floor(clock / 1000), primaryAuth: 'password' });
  const otp = (secret) => new OTPAuth.TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 }).generate({ timestamp: clock });
  async function enableTotp() {
    const setup = await service.beginEnrollment(user._id, 'totp', password, fresh());
    const result = await service.finishEnrollment(user._id, setup.challengeToken, 'totp', otp(setup.secret));
    user = result.user;
    return { ...result, secret: setup.secret };
  }
  async function enableEmail() {
    const setup = await service.beginEnrollment(user._id, 'email', password, fresh());
    const code = mailer.sendMail.mock.calls.at(-1)[0].text.match(/\d{6}/)[0];
    const result = await service.finishEnrollment(user._id, setup.challengeToken, 'email', code);
    user = result.user;
    return result;
  }
  beforeAll(async () => {
    const parsed = new URL(uri);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !parsed.pathname.startsWith('/ctxhub_test_')) throw new Error('Integration DB must be disposable and local');
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 3000 });
    await AuthMfaChallenge.createIndexes();
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), AuthMfaChallenge.deleteMany({})]);
    clock = Date.parse('2026-11-16T10:00:00Z');
    process.env.AUTH_MFA_ENABLED = 'true';
    process.env.AUTH_MFA_CREDENTIALS_KEY = crypto.randomBytes(32).toString('base64');
    mailer = { sendMail: vi.fn().mockResolvedValue(true) };
    throttle = { consume: vi.fn().mockResolvedValue({ allowed: true }) };
    service = new MfaService({ mailer, throttle, now: () => clock });
    const _id = new mongoose.Types.ObjectId();
    await User.collection.insertOne({ _id, email: 'mfa@example.test', firstName: 'MFA', lastName: 'Test', password: bcrypt.hashSync(password, 4), status: 'active', isEmailVerified: true, emailVerifiedAt: new Date(clock), tokenVersion: 0 });
    user = await User.findById(_id);
  });
  afterAll(async () => { if (mongoose.connection.readyState === 1) await mongoose.connection.dropDatabase(); await mongoose.disconnect(); delete process.env.AUTH_MFA_CREDENTIALS_KEY; delete process.env.AUTH_MFA_ENABLED; });

  it('keeps existing accounts optional and requires primary proof before setup', async () => {
    expect((await service.status(user._id, {})).enabled).toBe(false);
    await expect(service.beginEnrollment(user._id, 'totp', 'wrong', fresh())).rejects.toMatchObject({ code: 'MfaPasswordInvalid' });
    process.env.AUTH_MFA_ENABLED = 'false';
    await expect(service.beginEnrollment(user._id, 'totp', password, fresh())).rejects.toMatchObject({ code: 'MfaUnavailable' });
  });
  it('confirms TOTP before enabling, encrypts secrets and invalidates prior sessions', async () => {
    const setup = await service.beginEnrollment(user._id, 'totp', password, fresh());
    expect((await service.status(user._id, {})).enabled).toBe(false);
    const record = await AuthMfaChallenge.collection.findOne({ _id: cipher.hashToken(setup.challengeToken) });
    expect(record.secretEncrypted).not.toContain(setup.secret);
    expect(cipher.decryptSecret(record.secretEncrypted, user._id)).toBe(setup.secret);
    const result = await service.finishEnrollment(user._id, setup.challengeToken, 'totp', otp(setup.secret));
    expect(result.user.tokenVersion).toBe(1);
    expect(result.recoveryCodes).toHaveLength(8);
    const json = (await service.user(user._id)).toJSON();
    expect(json.mfa).not.toHaveProperty('totpSecret'); expect(json.mfa).not.toHaveProperty('recoveryCodeHashes');
    await expect(service.user(user._id, 0)).rejects.toMatchObject({ code: 'MfaChallengeExpired' });
    await expect(service.finishEnrollment(user._id, setup.challengeToken, 'totp', otp(setup.secret))).rejects.toMatchObject({ code: 'MfaChallengeExpired' });
  });
  it('rejects TOTP replay across concurrent challenges, including the enrollment code', async () => {
    const { secret } = await enableTotp();
    let challenge = await service.loginChallenge(user);
    await expect(service.verifyLogin(challenge.token, 'totp', otp(secret))).rejects.toMatchObject({ code: 'MfaCodeInvalid' });
    clock += 30000;
    const challenges = await Promise.all([service.loginChallenge(user), service.loginChallenge(user)]);
    const results = await Promise.allSettled(challenges.map((item) => service.verifyLogin(item.token, 'totp', otp(secret))));
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((item) => item.status === 'rejected')).toHaveLength(1);
  });
  it('consumes each recovery code only once across concurrent challenges', async () => {
    const { recoveryCodes } = await enableTotp();
    const challenges = await Promise.all([service.loginChallenge(user), service.loginChallenge(user)]);
    expect(challenges[0].public.recoveryAvailable).toBe(true);
    const results = await Promise.allSettled(challenges.map((item) => service.verifyLogin(item.token, 'recovery', recoveryCodes[0])));
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect((await service.status(user._id, fresh())).recoveryCodesRemaining).toBe(7);
  });
  it('reserves only five attempts even when requests race', async () => {
    await enableTotp();
    const challenge = await service.loginChallenge(user);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => service.verifyLogin(challenge.token, 'totp', 'invalid')));
    expect(results.every((item) => item.status === 'rejected')).toBe(true);
    expect(await AuthMfaChallenge.collection.findOne({ _id: cipher.hashToken(challenge.token) })).toMatchObject({ attempts: 5 });
    await expect(service.challengeStatus(challenge.token)).rejects.toMatchObject({ code: 'MfaChallengeExpired' });
  });
  it('binds email codes to the challenge and accepts a concurrent verification only once', async () => {
    await enableEmail();
    const [first, second] = await Promise.all([service.loginChallenge(user), service.loginChallenge(user)]);
    await service.sendCode(first.token);
    const code = mailer.sendMail.mock.calls.at(-1)[0].text.match(/\d{6}/)[0];
    await expect(service.verifyLogin(second.token, 'email', code)).rejects.toMatchObject({ code: 'MfaCodeInvalid' });
    const results = await Promise.allSettled([service.verifyLogin(first.token, 'email', code), service.verifyLogin(first.token, 'email', code)]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    expect(mailer.sendMail.mock.calls.at(-1)[1]).toBeUndefined(); // Global SMTP, never tenant-controlled SMTP.
  });
  it('enforces shared cooldown, per-address quota and code expiry', async () => {
    await enableEmail();
    const challenge = await service.loginChallenge(user);
    await service.sendCode(challenge.token);
    await expect(service.sendCode(challenge.token)).rejects.toMatchObject({ code: 'MfaResendLimited', statusCode: 429 });
    clock += 61000;
    throttle.consume.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 700 });
    await expect(service.sendCode(challenge.token)).rejects.toMatchObject({ retryAfterSeconds: 700 });
    expect(throttle.consume).toHaveBeenCalledWith('mfa-code', 'mfa@example.test');
    const setup = await service.beginEnrollment(user._id, 'totp', password, fresh());
    clock += 601000;
    await expect(service.finishEnrollment(user._id, setup.challengeToken, 'totp', otp(setup.secret))).rejects.toMatchObject({ code: 'MfaChallengeExpired' });
  });
  it('cannot finish enrollment after a password reset changes tokenVersion', async () => {
    const setup = await service.beginEnrollment(user._id, 'totp', password, fresh());
    await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    await expect(service.finishEnrollment(user._id, setup.challengeToken, 'totp', otp(setup.secret))).rejects.toMatchObject({ code: 'MfaChallengeExpired' });
  });
  it('requires recent MFA and primary proof to disable or regenerate codes', async () => {
    const { recoveryCodes } = await enableTotp();
    await expect(service.changeSettings(user._id, 'disable', password, { ...fresh(), mfaAt: Math.floor(clock / 1000) - 301 })).rejects.toMatchObject({ code: 'MfaReauthenticationRequired' });
    const regenerated = await service.changeSettings(user._id, 'recovery', password, fresh());
    user = regenerated.user;
    const challenge = await service.loginChallenge(user);
    await expect(service.verifyLogin(challenge.token, 'recovery', recoveryCodes[0])).rejects.toMatchObject({ code: 'MfaCodeInvalid' });
    const disabled = await service.changeSettings(user._id, 'disable', password, fresh());
    expect(disabled.user.tokenVersion).toBe(3);
    expect((await service.status(user._id, {})).enabled).toBe(false);
  });
  it('preserves the factor gate when enrollment is disabled or the key is unavailable', async () => {
    const { recoveryCodes } = await enableTotp();
    process.env.AUTH_MFA_ENABLED = 'false';
    delete process.env.AUTH_MFA_CREDENTIALS_KEY;
    const challenge = await service.loginChallenge(user);
    expect(challenge.public.methods).toEqual([]);
    expect(challenge.public.recoveryAvailable).toBe(true);
    const result = await service.verifyLogin(challenge.token, 'recovery', recoveryCodes[0]);
    expect(result.user._id.toString()).toBe(user._id.toString());
  });
  it('allows Google primary proof only for the linked user and a fresh Google login', async () => {
    await User.updateOne({ _id: user._id }, { $set: { googleSubject: 'linked-google-subject' } });
    const proof = { primaryAuth: 'google', authAt: Math.floor(clock / 1000) };
    await expect(service.beginEnrollment(user._id, 'totp', '', { ...proof, authAt: proof.authAt - 301 })).rejects.toMatchObject({ code: 'MfaPasswordRequired' });
    await expect(service.beginEnrollment(user._id, 'totp', '', { ...proof, authAt: proof.authAt + 10 })).rejects.toMatchObject({ code: 'MfaPasswordRequired' });
    expect((await service.beginEnrollment(user._id, 'totp', '', proof)).secret).toBeTruthy();
  });
  it('enrolls older accounts without a stored tokenVersion and persists reminder snoozes', async () => {
    await User.collection.updateOne({ _id: user._id }, { $unset: { tokenVersion: 1 } });
    await service.snooze(user._id, 0);
    expect((await service.status(user._id, {})).reminderAfter.getTime()).toBe(clock + 7 * 86400000);
    const setup = await service.beginEnrollment(user._id, 'totp', password, fresh());
    const result = await service.finishEnrollment(user._id, setup.challengeToken, 'totp', otp(setup.secret));
    expect(result.user.tokenVersion).toBe(1);
  });
  it('completes password + TOTP sign-in through real routes and keeps pending cookies out of authenticated settings', async () => {
    const { secret } = await enableTotp();
    clock += 30000;
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    const Fastify = require('fastify');
    const app = Fastify();
    await app.register(require('@fastify/jwt'), { secret: 'test-only-local-mfa-session-secret-32-bytes' });
    await app.register(require('../routes/auth'));
    try {
      const primary = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: user.email, password } });
      expect(primary.statusCode).toBe(202);
      const pending = [primary.headers['set-cookie']].flat().find((item) => item.startsWith('ctx_mfa=')).split(';')[0];
      expect((await app.inject({ url: '/auth/mfa/settings', headers: { cookie: pending } })).statusCode).toBe(401);
      const verified = await app.inject({ method: 'POST', url: '/auth/mfa/verify', headers: { cookie: pending, origin: 'http://localhost:3100' }, payload: { method: 'totp', code: otp(secret) } });
      expect(verified.statusCode).toBe(200);
      expect(verified.json()).not.toHaveProperty('token');
      const full = [verified.headers['set-cookie']].flat().find((item) => item.startsWith('ctx_session=')).split(';')[0];
      const claims = app.jwt.verify(decodeURIComponent(full.split('=')[1]));
      expect(claims).toMatchObject({ sub: String(user._id), mfaAt: Math.floor(clock / 1000), primaryAuth: 'password', tokenVersion: 1 });
      const settings = await app.inject({ url: '/auth/mfa/settings', headers: { cookie: full } });
      expect(settings.statusCode).toBe(200); expect(settings.json().enabled).toBe(true);
      const csrfDenied = await app.inject({ method: 'POST', url: '/auth/mfa/settings/disable', headers: { cookie: full, origin: 'http://localhost:3100' }, payload: { currentPassword: password } });
      expect(csrfDenied.statusCode).toBe(403);
    } finally { dateSpy.mockRestore(); await app.close(); }
  });

});
