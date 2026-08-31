const crypto = require('crypto');

function getEncryptionKey(value = process.env.BILLING_PII_ENCRYPTION_KEY) {
  const raw = String(value || '').trim();
  if (!raw) {
    const error = new Error('BILLING_PII_ENCRYPTION_KEY is not configured');
    error.code = 'BillingPiiNotConfigured';
    throw error;
  }
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    const error = new Error('BILLING_PII_ENCRYPTION_KEY must decode to 32 bytes');
    error.code = 'BillingPiiNotConfigured';
    throw error;
  }
  return key;
}

function encryptBillingPii(value, keyValue) {
  const plaintext = String(value || '');
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(keyValue), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptBillingPii(value, keyValue) {
  if (!value) return '';
  const [version, ivEncoded, tagEncoded, encryptedEncoded] = String(value).split(':');
  if (version !== 'v1' || !ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error('Encrypted billing PII envelope is invalid');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(keyValue),
    Buffer.from(ivEncoded, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

module.exports = { decryptBillingPii, encryptBillingPii, getEncryptionKey };
