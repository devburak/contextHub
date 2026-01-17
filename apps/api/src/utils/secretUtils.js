const crypto = require('crypto');

const ENCRYPTION_PREFIX = 'enc:v1';
const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const secret = process.env.SMTP_SECRET_KEY;
  if (!secret) {
    return null;
  }

  return crypto.createHash('sha256').update(secret).digest();
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${ENCRYPTION_PREFIX}:`);
}

function encryptSecret(value) {
  if (value === undefined || value === null) {
    return value;
  }

  const key = getKey();
  if (!key) {
    throw new Error('SMTP_SECRET_KEY ortam değişkeni tanımlanmalı (SMTP bilgilerini şifrelemek için).');
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}:${iv.toString('base64')}:${encrypted.toString('base64')}:${authTag.toString('base64')}`;
}

function decryptSecret(value) {
  if (!isEncrypted(value)) {
    return value;
  }

  const key = getKey();
  if (!key) {
    throw new Error('SMTP_SECRET_KEY ortam değişkeni eksik olduğu için SMTP parolası çözülemedi.');
  }

  const [, ivB64, ciphertextB64, authTagB64] = value.split(':');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncrypted
};
