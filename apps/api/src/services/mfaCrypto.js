const crypto = require('node:crypto');
const OTPAuth = require('otpauth');

function credentialsKey() {
  const value = String(process.env.AUTH_MFA_CREDENTIALS_KEY || '').trim();
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32 || key.toString('base64') !== value) {
    throw new Error('AUTH_MFA_CREDENTIALS_KEY must be a base64 encoded 32-byte key');
  }
  return key;
}

function isConfigured() {
  try { credentialsKey(); return true; } catch { return false; }
}

function encryptSecret(secret, userId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', credentialsKey(), iv);
  cipher.setAAD(Buffer.from(`contexthub:mfa:${userId}`));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((value) => value.toString('base64url')).join('.');
}

function decryptSecret(encrypted, userId) {
  const parts = String(encrypted || '').split('.');
  if (parts.length !== 3) throw new Error('Invalid MFA secret');
  const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', credentialsKey(), iv);
  decipher.setAAD(Buffer.from(`contexthub:mfa:${userId}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function totp(secret, email = '') {
  return new OTPAuth.TOTP({ issuer: 'ContextHub', label: email, algorithm: 'SHA1', digits: 6, period: 30, secret });
}

function createTotp(email) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const value = totp(secret, email);
  return { secret: secret.base32, uri: value.toString() };
}

function validateTotp(secret, code, timestamp = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const delta = totp(secret).validate({ token: code, timestamp, window: 1 });
  return delta === null ? null : Math.floor(timestamp / 30000) + delta;
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function recoveryHash(value) {
  const normalized = String(value || '').replace(/[-\s]/g, '').toLowerCase();
  return /^[a-f0-9]{32}$/.test(normalized) ? hashToken(`mfa-recovery:${normalized}`) : null;
}

function createRecoveryCodes() {
  const codes = Array.from({ length: 8 }, () => crypto.randomBytes(16).toString('hex').match(/.{4}/g).join('-'));
  return { codes, hashes: codes.map(recoveryHash) };
}

function emailCodeDigest(challengeHash, code) {
  return crypto.createHmac('sha256', credentialsKey()).update(`mfa-email:${challengeHash}:${code}`).digest('hex');
}

function equalDigest(left, right) {
  if (![left, right].every((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

module.exports = { isConfigured, encryptSecret, decryptSecret, createTotp, validateTotp,
  hashToken, recoveryHash, createRecoveryCodes, emailCodeDigest, equalDigest };
