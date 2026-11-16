import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const mfa = require('./mfaCrypto');

afterEach(() => vi.unstubAllEnvs());
const key = () => vi.stubEnv('AUTH_MFA_CREDENTIALS_KEY', Buffer.alloc(32, 9).toString('base64'));

describe('MFA cryptography', () => {
  it('requires a canonical 32-byte key and binds the encrypted secret to its account', () => {
    vi.stubEnv('AUTH_MFA_CREDENTIALS_KEY', '');
    expect(mfa.isConfigured()).toBe(false);
    key();
    const stored = mfa.encryptSecret('AUTHENTICATORSECRET', 'user-a');
    expect(stored).not.toContain('AUTHENTICATORSECRET');
    expect(mfa.decryptSecret(stored, 'user-a')).toBe('AUTHENTICATORSECRET');
    expect(() => mfa.decryptSecret(stored, 'user-b')).toThrow();
    const parts = stored.split('.');
    parts[1] = Buffer.alloc(16, 1).toString('base64url');
    expect(() => mfa.decryptSecret(parts.join('.'), 'user-a')).toThrow();
  });

  it('accepts RFC 6238 values within one step and reports the exact matched step', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(mfa.validateTotp(secret, '287082', 59000)).toBe(1);
    expect(mfa.validateTotp(secret, '287082', 60000)).toBe(1);
    expect(mfa.validateTotp(secret, '287082', 120000)).toBeNull();
    expect(mfa.validateTotp(secret, '28708', 59000)).toBeNull();
  });

  it('generates local authenticator setup and high entropy one-time recovery values', () => {
    const setup = mfa.createTotp('user@example.invalid');
    expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(setup.uri).toContain('ContextHub');
    const recovery = mfa.createRecoveryCodes();
    expect(new Set(recovery.codes).size).toBe(8);
    expect(recovery.hashes).not.toEqual(recovery.codes);
    expect(mfa.recoveryHash(recovery.codes[0].toUpperCase())).toBe(recovery.hashes[0]);
    expect(mfa.recoveryHash('123456')).toBeNull();
  });

  it('binds low entropy email codes to a challenge with the private key', () => {
    key();
    const digest = mfa.emailCodeDigest('challenge-a', '123456');
    expect(mfa.equalDigest(digest, mfa.emailCodeDigest('challenge-a', '123456'))).toBe(true);
    expect(mfa.equalDigest(digest, mfa.emailCodeDigest('challenge-b', '123456'))).toBe(false);
    expect(mfa.equalDigest(digest, mfa.emailCodeDigest('challenge-a', '654321'))).toBe(false);
    expect(mfa.equalDigest(digest, '')).toBe(false);
  });
});
