const crypto = require('node:crypto');
const { ExtensionTenantSecret } = require('@contexthub/common');

const SECRET_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const TENANT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const ENCRYPTION_PREFIX = 'enc:v1';
const MAX_SECRET_BYTES = 32 * 1024;

class ExtensionSecretsFacadeError extends Error {
  constructor(message, code = 'EXTENSION_SECRET_INVALID') {
    super(message);
    this.name = 'ExtensionSecretsFacadeError';
    this.code = code;
  }
}

function normalizeTenantId(value) {
  const tenantId = String(value ?? '').trim();
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new ExtensionSecretsFacadeError('tenantId must be a 24-character hexadecimal id');
  }
  return tenantId;
}

function normalizeKey(value) {
  const key = String(value ?? '').trim();
  if (!SECRET_KEY_PATTERN.test(key)) {
    throw new ExtensionSecretsFacadeError('secret key must use lowercase letters, numbers and hyphens');
  }
  return key;
}

function normalizeRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ExtensionSecretsFacadeError('expectedRevision must be a non-negative safe integer');
  }
  return value;
}

function serializeSecret(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ExtensionSecretsFacadeError('secret value must be JSON serializable');
  }
  if (serialized === undefined || Buffer.byteLength(serialized, 'utf8') > MAX_SECRET_BYTES) {
    throw new ExtensionSecretsFacadeError(`secret value must not exceed ${MAX_SECRET_BYTES} bytes`);
  }
  return serialized;
}

function resolveMasterKey(value = process.env.EXTENSION_SECRET_KEY) {
  const secret = String(value ?? '');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new ExtensionSecretsFacadeError(
      'EXTENSION_SECRET_KEY must contain at least 32 bytes',
      'EXTENSION_SECRET_KEY_MISSING'
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function associatedData({ tenantId, plugin, key }) {
  return Buffer.from(`ctxhub-extension-secret\0${tenantId}\0${plugin}\0${key}`, 'utf8');
}

function createSecretCodec(masterKey) {
  return Object.freeze({
    encrypt(value, identity) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', resolveMasterKey(masterKey), iv);
      cipher.setAAD(associatedData(identity));
      const encrypted = Buffer.concat([cipher.update(serializeSecret(value), 'utf8'), cipher.final()]);
      return [
        ENCRYPTION_PREFIX,
        iv.toString('base64'),
        encrypted.toString('base64'),
        cipher.getAuthTag().toString('base64')
      ].join(':');
    },

    decrypt(ciphertext, identity) {
      const parts = String(ciphertext ?? '').split(':');
      if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== ENCRYPTION_PREFIX) {
        throw new ExtensionSecretsFacadeError('stored secret ciphertext is invalid');
      }
      try {
        const decipher = crypto.createDecipheriv(
          'aes-256-gcm',
          resolveMasterKey(masterKey),
          Buffer.from(parts[2], 'base64')
        );
        decipher.setAAD(associatedData(identity));
        decipher.setAuthTag(Buffer.from(parts[4], 'base64'));
        const decrypted = Buffer.concat([
          decipher.update(Buffer.from(parts[3], 'base64')),
          decipher.final()
        ]);
        return JSON.parse(decrypted.toString('utf8'));
      } catch (error) {
        if (error instanceof ExtensionSecretsFacadeError) throw error;
        throw new ExtensionSecretsFacadeError(
          'stored secret cannot be decrypted in this tenant/plugin namespace',
          'EXTENSION_SECRET_DECRYPT_FAILED'
        );
      }
    }
  });
}

function secretMetadata(doc) {
  if (!doc) return Object.freeze({ configured: false, revision: 0, updatedAt: null });
  const value = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return Object.freeze({
    configured: true,
    revision: value.revision,
    updatedAt: value.updatedAt || null
  });
}

function conflict(plugin, key) {
  return new ExtensionSecretsFacadeError(
    `secret revision conflict: ${plugin}/${key}`,
    'EXTENSION_SECRET_REVISION_CONFLICT'
  );
}

function createExtensionSecretsFacade({
  plugin,
  model = ExtensionTenantSecret,
  codec = createSecretCodec()
} = {}) {
  const pluginName = String(plugin ?? '').trim();
  if (!pluginName) throw new TypeError('plugin is required');

  return Object.freeze({
    async metadata({ tenantId, key } = {}) {
      const identity = {
        tenantId: normalizeTenantId(tenantId),
        plugin: pluginName,
        key: normalizeKey(key)
      };
      const doc = await model.findOne(identity).lean();
      return secretMetadata(doc);
    },

    async get({ tenantId, key } = {}) {
      const identity = {
        tenantId: normalizeTenantId(tenantId),
        plugin: pluginName,
        key: normalizeKey(key)
      };
      const doc = await model.findOne(identity).select('+ciphertext').lean();
      if (!doc) return null;
      return Object.freeze({
        value: codec.decrypt(doc.ciphertext, identity),
        revision: doc.revision,
        updatedAt: doc.updatedAt || null
      });
    },

    async set({ tenantId, key, value, expectedRevision, updatedBy = null } = {}) {
      const identity = {
        tenantId: normalizeTenantId(tenantId),
        plugin: pluginName,
        key: normalizeKey(key)
      };
      const revision = normalizeRevision(expectedRevision);
      const operatorId = updatedBy ? normalizeTenantId(updatedBy) : null;
      const ciphertext = codec.encrypt(value, identity);

      if (revision === 0) {
        try {
          const created = await model.create({
            ...identity,
            ciphertext,
            revision: 1,
            updatedBy: operatorId
          });
          return secretMetadata(created);
        } catch (error) {
          if (error?.code === 11000) throw conflict(pluginName, identity.key);
          throw error;
        }
      }

      const updated = await model.findOneAndUpdate(
        { ...identity, revision },
        { $set: { ciphertext, updatedBy: operatorId }, $inc: { revision: 1 } },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) throw conflict(pluginName, identity.key);
      return secretMetadata(updated);
    }
  });
}

module.exports = {
  ExtensionSecretsFacadeError,
  MAX_SECRET_BYTES,
  createExtensionSecretsFacade,
  createSecretCodec,
  __testables: {
    associatedData,
    normalizeKey,
    normalizeRevision,
    normalizeTenantId,
    resolveMasterKey,
    secretMetadata,
    serializeSecret
  }
};
