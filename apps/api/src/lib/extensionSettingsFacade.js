const { ExtensionTenantSetting } = require('@contexthub/common');

const SETTING_KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const TENANT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const MAX_SETTING_BYTES = 64 * 1024;

class ExtensionSettingsFacadeError extends Error {
  constructor(message, code = 'EXTENSION_SETTING_INVALID') {
    super(message);
    this.name = 'ExtensionSettingsFacadeError';
    this.code = code;
  }
}

function normalizeTenantId(value) {
  const tenantId = String(value ?? '').trim();
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new ExtensionSettingsFacadeError('tenantId must be a 24-character hexadecimal id');
  }
  return tenantId;
}

function normalizeKey(value) {
  const key = String(value ?? '').trim();
  if (!SETTING_KEY_PATTERN.test(key)) {
    throw new ExtensionSettingsFacadeError('setting key must use lowercase letters, numbers and hyphens');
  }
  return key;
}

function normalizeRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ExtensionSettingsFacadeError('expectedRevision must be a non-negative safe integer');
  }
  return value;
}

function normalizeJsonValue(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new ExtensionSettingsFacadeError('setting value must be JSON serializable');
  }
  if (serialized === undefined) {
    throw new ExtensionSettingsFacadeError('setting value must be JSON serializable');
  }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_SETTING_BYTES) {
    throw new ExtensionSettingsFacadeError(
      `setting value exceeds ${MAX_SETTING_BYTES} bytes`,
      'EXTENSION_SETTING_TOO_LARGE'
    );
  }
  return JSON.parse(serialized);
}

function serializeSetting(doc) {
  if (!doc) return null;
  const value = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return Object.freeze({
    key: value.key,
    value: normalizeJsonValue(value.value),
    revision: value.revision,
    createdAt: value.createdAt || null,
    updatedAt: value.updatedAt || null
  });
}

function conflict(plugin, key) {
  return new ExtensionSettingsFacadeError(
    `setting revision conflict: ${plugin}/${key}`,
    'EXTENSION_SETTING_REVISION_CONFLICT'
  );
}

function createExtensionSettingsFacade({ plugin, model = ExtensionTenantSetting } = {}) {
  const pluginName = String(plugin ?? '').trim();
  if (!pluginName) throw new TypeError('plugin is required');

  return Object.freeze({
    async listTenantIds({ key } = {}) {
      const normalizedKey = normalizeKey(key);
      const docs = await model.find({ plugin: pluginName, key: normalizedKey })
        .select('tenantId')
        .lean();
      return Object.freeze(
        Array.from(new Set((docs || []).map((doc) => String(doc.tenantId)))).sort()
      );
    },

    async get({ tenantId, key } = {}) {
      const normalizedTenantId = normalizeTenantId(tenantId);
      const normalizedKey = normalizeKey(key);
      const doc = await model.findOne({
        tenantId: normalizedTenantId,
        plugin: pluginName,
        key: normalizedKey
      }).lean();
      return serializeSetting(doc);
    },

    async set({ tenantId, key, value, expectedRevision, updatedBy = null } = {}) {
      const normalizedTenantId = normalizeTenantId(tenantId);
      const normalizedKey = normalizeKey(key);
      const normalizedValue = normalizeJsonValue(value);
      const revision = normalizeRevision(expectedRevision);
      const operatorId = updatedBy ? normalizeTenantId(updatedBy) : null;

      if (revision === 0) {
        try {
          const created = await model.create({
            tenantId: normalizedTenantId,
            plugin: pluginName,
            key: normalizedKey,
            value: normalizedValue,
            revision: 1,
            updatedBy: operatorId
          });
          return serializeSetting(created);
        } catch (error) {
          if (error?.code === 11000) throw conflict(pluginName, normalizedKey);
          throw error;
        }
      }

      const updated = await model.findOneAndUpdate(
        {
          tenantId: normalizedTenantId,
          plugin: pluginName,
          key: normalizedKey,
          revision
        },
        {
          $set: { value: normalizedValue, updatedBy: operatorId },
          $inc: { revision: 1 }
        },
        { new: true, runValidators: true }
      ).lean();
      if (!updated) throw conflict(pluginName, normalizedKey);
      return serializeSetting(updated);
    }
  });
}

module.exports = {
  ExtensionSettingsFacadeError,
  MAX_SETTING_BYTES,
  createExtensionSettingsFacade,
  __testables: {
    normalizeJsonValue,
    normalizeKey,
    normalizeRevision,
    normalizeTenantId,
    serializeSetting
  }
};
