import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';

const require = createRequire(import.meta.url);
const { User } = require('@contexthub/common');
const bcrypt = require('bcryptjs');
const AuthService = require('./authService');
const { mailService } = require('./mailService');
const ActivityLog = require('@contexthub/common/src/models/ActivityLog');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const validToken = 'a'.repeat(64);

function userDoc(overrides = {}) {
  return {
    _id: { toString: () => 'user-1' },
    email: 'person@example.com',
    firstName: 'Per',
    lastName: 'Son',
    name: 'Per Son',
    tokenVersion: 4,
    isEmailVerified: false,
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('AuthService reset and verification tokens', () => {
  let service;

  beforeEach(() => {
    service = new AuthService({});
    vi.spyOn(service, 'logActivity').mockResolvedValue(undefined);
    // Security events are written straight to the audit collection; keep them off the database.
    vi.spyOn(ActivityLog, 'create').mockResolvedValue({});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores only the SHA-256 hash of the reset token that is e-mailed', async () => {
    const user = userDoc();
    vi.spyOn(User, 'findOne').mockResolvedValue(user);
    const send = vi.spyOn(mailService, 'sendPasswordResetEmail').mockResolvedValue(true);

    await service.forgotPassword('person@example.com');

    const emailedToken = send.mock.calls[0][1];
    expect(emailedToken).toMatch(/^[a-f0-9]{64}$/);
    expect(user.resetPasswordToken).toBe(sha256(emailedToken));
    expect(user.resetPasswordToken).not.toBe(emailedToken);
    expect(user.resetPasswordExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('finds the reset token with one equality query instead of comparing every outstanding token', async () => {
    const user = userDoc({ resetPasswordToken: sha256(validToken), mustChangePassword: true });
    const findOne = vi.spyOn(User, 'findOne').mockResolvedValue(user);
    const find = vi.spyOn(User, 'find');
    const compare = vi.spyOn(bcrypt, 'compare');
    vi.spyOn(mailService, 'sendPasswordChangeEmail').mockResolvedValue(true);

    await service.resetPassword(validToken, 'new-long-password');

    expect(findOne).toHaveBeenCalledTimes(1);
    expect(findOne.mock.calls[0][0]).toMatchObject({ resetPasswordToken: { $eq: sha256(validToken), $type: 'string' } });
    expect(findOne.mock.calls[0][0].resetPasswordExpiresAt.$gt).toBeInstanceOf(Date);
    expect(find).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();

    expect(user.password).toBe('new-long-password');
    expect(user.tokenVersion).toBe(5);
    expect(user.mustChangePassword).toBe(false);
    expect(user.resetPasswordToken).toBeNull();
    expect(user.resetPasswordExpiresAt).toBeNull();
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  it('tells the account owner when a reset changes the password', async () => {
    vi.spyOn(User, 'findOne').mockResolvedValue(userDoc());
    const notify = vi.spyOn(mailService, 'sendPasswordChangeEmail').mockResolvedValue(true);

    await service.resetPassword(validToken, 'new-long-password', {
      ip: '203.0.113.9',
      headers: { 'user-agent': 'vitest' },
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toBe('person@example.com');
    expect(notify.mock.calls[0][2]).toMatchObject({ userAgent: 'vitest' });
  });

  it('still completes the reset when the notification e-mail fails', async () => {
    const user = userDoc();
    vi.spyOn(User, 'findOne').mockResolvedValue(user);
    vi.spyOn(mailService, 'sendPasswordChangeEmail').mockRejectedValue(new Error('smtp down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(service.resetPassword(validToken, 'new-long-password')).resolves.toMatchObject({
      message: 'Password reset successfully',
    });
    expect(user.save).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['too short', 'abc123'],
    ['not hexadecimal', 'z'.repeat(64)],
    ['uppercase', 'A'.repeat(64)],
    ['a query object', { $gt: '' }],
    ['a legacy bcrypt hash', '$2a$10$abcdefghijklmnopqrstuuJ4d8q0p3mQyqzZk0j8m1W0b9c7eXyZa'],
  ])('rejects a reset token that is %s without touching the database', async (_label, token) => {
    const findOne = vi.spyOn(User, 'findOne');

    await expect(service.resetPassword(token, 'new-long-password')).rejects.toThrow(/Geçersiz veya süresi dolmuş/);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects a well-formed reset token that matches no stored hash', async () => {
    vi.spyOn(User, 'findOne').mockResolvedValue(null);
    const notify = vi.spyOn(mailService, 'sendPasswordChangeEmail');

    await expect(service.resetPassword(validToken, 'new-long-password')).rejects.toThrow(/Geçersiz veya süresi dolmuş/);
    expect(notify).not.toHaveBeenCalled();
  });

  it('verifies an e-mail address through the hashed token lookup', async () => {
    const user = userDoc({ emailVerificationToken: sha256(validToken) });
    const findOne = vi.spyOn(User, 'findOne').mockResolvedValue(user);
    const find = vi.spyOn(User, 'find');
    const compare = vi.spyOn(bcrypt, 'compare');
    vi.spyOn(mailService, 'sendWelcomeEmail').mockResolvedValue(true);

    const result = await service.verifyEmail(validToken);

    expect(result).toMatchObject({ verified: true });
    expect(findOne.mock.calls[0][0]).toMatchObject({ emailVerificationToken: { $eq: sha256(validToken), $type: 'string' } });
    expect(find).not.toHaveBeenCalled();
    expect(compare).not.toHaveBeenCalled();
    expect(user.isEmailVerified).toBe(true);
    expect(user.emailVerificationToken).toBeNull();
  });

  it('rejects a malformed verification token without touching the database', async () => {
    const findOne = vi.spyOn(User, 'findOne');

    await expect(service.verifyEmail('not-a-token')).rejects.toThrow(/Geçersiz veya süresi dolmuş/);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('stores only the hash of a resent verification token', async () => {
    const user = userDoc();
    vi.spyOn(User, 'findOne').mockResolvedValue(user);
    const send = vi.spyOn(mailService, 'sendEmailVerificationEmail').mockResolvedValue(true);

    await service.resendVerificationEmail('person@example.com');

    const emailedToken = send.mock.calls[0][2];
    expect(emailedToken).toMatch(/^[a-f0-9]{64}$/);
    expect(user.emailVerificationToken).toBe(sha256(emailedToken));
  });
});
