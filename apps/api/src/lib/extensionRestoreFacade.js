const { Tenant, mongoose } = require('@contexthub/common');

const TENANT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const RESTORABLE_COLLECTIONS = Object.freeze([
  'categories',
  'collectionentries',
  'collectiontypes',
  'contents',
  'contenttypes',
  'contentversions',
  'customfielddefinitions',
  'entries',
  'entryrevisions',
  'formdefinitions',
  'formversions',
  'galleries',
  'media',
  'menus',
  'placementdefinitions',
  'products',
  'tags',
  'taxonomies',
  'templates',
  'terms'
]);
const USER_REFERENCE_FIELDS = new Set([
  'createdBy',
  'deletedBy',
  'invitedBy',
  'lastModifiedBy',
  'publishedBy',
  'submittedBy',
  'updatedBy',
  'userEmail',
  'userId',
  'userName'
]);

class ExtensionRestoreFacadeError extends Error {
  constructor(message, code = 'EXTENSION_RESTORE_INVALID') {
    super(message);
    this.name = 'ExtensionRestoreFacadeError';
    this.code = code;
  }
}

function createExtensionRestoreFacade(options = {}) {
  const connection = options.connection || mongoose.connection;
  const tenantModel = options.tenantModel || Tenant;
  const media = options.media || (() => require('../services/mediaService'));

  function database() {
    if (!connection?.db) {
      throw new ExtensionRestoreFacadeError(
        'Mongo connection is not ready',
        'EXTENSION_RESTORE_DATABASE_UNAVAILABLE'
      );
    }
    return connection.db;
  }

  async function findTenant(tenantId) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const tenant = await tenantModel.findById(normalizedTenantId)
      .select('_id slug status')
      .lean();
    if (!tenant) return null;
    return Object.freeze({
      id: String(tenant._id),
      slug: String(tenant.slug || ''),
      status: String(tenant.status || '')
    });
  }

  return Object.freeze({
    async getTenant({ tenantId } = {}) {
      return findTenant(tenantId);
    },

    async findPopulatedCollections({ tenantId, collections } = {}) {
      const targetTenantId = new mongoose.Types.ObjectId(normalizeTenantId(tenantId));
      const names = normalizeCollections(collections);
      const populated = [];
      for (const collection of names) {
        const count = await database().collection(collection)
          .countDocuments({ tenantId: targetTenantId }, { limit: 1 });
        if (count > 0) populated.push(collection);
      }
      return Object.freeze(populated);
    },

    async checkIdentity({ collection, id, tenantId } = {}) {
      const name = normalizeCollection(collection);
      const documentId = normalizeObjectId(id, 'id');
      const normalizedTenantId = normalizeTenantId(tenantId);
      const existing = await database().collection(name).findOne(
        { _id: documentId },
        { projection: { tenantId: 1 } }
      );
      if (existing && String(existing.tenantId) !== normalizedTenantId) {
        throw new ExtensionRestoreFacadeError(
          `document id belongs to another tenant: ${name}/${id}`,
          'EXTENSION_RESTORE_ID_CONFLICT'
        );
      }
      return Object.freeze({ conflict: false });
    },

    async upsert({ collection, id, tenantId, document } = {}) {
      const name = normalizeCollection(collection);
      const documentId = normalizeObjectId(id, 'id');
      const normalizedTenantId = normalizeTenantId(tenantId);
      const targetTenantId = new mongoose.Types.ObjectId(normalizedTenantId);
      const decoded = mongoose.mongo.BSON.EJSON.deserialize(document);
      if (String(decoded?._id || '') !== String(documentId)
        || String(decoded?.tenantId || '') !== normalizedTenantId) {
        throw new ExtensionRestoreFacadeError(
          'restore document identity is invalid',
          'EXTENSION_RESTORE_DOCUMENT_IDENTITY_INVALID'
        );
      }
      assertNoUserReferences(decoded);
      const existing = await database().collection(name).findOne(
        { _id: documentId },
        { projection: { tenantId: 1 } }
      );
      if (existing && String(existing.tenantId) !== normalizedTenantId) {
        throw new ExtensionRestoreFacadeError(
          `document id belongs to another tenant: ${name}/${id}`,
          'EXTENSION_RESTORE_ID_CONFLICT'
        );
      }
      decoded.tenantId = targetTenantId;
      await database().collection(name).replaceOne({ _id: documentId }, decoded, { upsert: true });
      return Object.freeze({ upserted: 1 });
    },

    async delete({ collection, id, tenantId } = {}) {
      const result = await database().collection(normalizeCollection(collection)).deleteOne({
        _id: normalizeObjectId(id, 'id'),
        tenantId: new mongoose.Types.ObjectId(normalizeTenantId(tenantId))
      });
      return Object.freeze({ deleted: result.deletedCount || 0 });
    },

    async getMediaTarget({ tenantId } = {}) {
      const tenant = await findTenant(tenantId);
      if (!tenant) return null;
      const target = media().getTenantRestoreTarget();
      return Object.freeze({ ...target, tenantSlug: tenant.slug });
    },

    async putFile({ tenantId, key, body, contentType, contentLength } = {}) {
      return media().putTenantRestoreFile({
        tenantId: normalizeTenantId(tenantId),
        key,
        body,
        contentType,
        contentLength
      });
    },

    async deleteFile({ tenantId, key } = {}) {
      return media().deleteTenantRestoreFile({
        tenantId: normalizeTenantId(tenantId),
        key
      });
    }
  });
}

function normalizeTenantId(value) {
  const tenantId = String(value || '').trim();
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    throw new ExtensionRestoreFacadeError('tenantId must be a 24-character hexadecimal id');
  }
  return tenantId.toLowerCase();
}

function normalizeObjectId(value, label) {
  const normalized = String(value || '').trim();
  if (!mongoose.Types.ObjectId.isValid(normalized)) {
    throw new ExtensionRestoreFacadeError(`${label} must be a valid ObjectId`);
  }
  return new mongoose.Types.ObjectId(normalized);
}

function normalizeCollection(value) {
  const name = String(value || '').trim();
  if (!RESTORABLE_COLLECTIONS.includes(name)) {
    throw new ExtensionRestoreFacadeError(
      `collection is not restorable: ${name || 'missing'}`,
      'EXTENSION_RESTORE_COLLECTION_FORBIDDEN'
    );
  }
  return name;
}

function normalizeCollections(value) {
  if (!Array.isArray(value)) throw new ExtensionRestoreFacadeError('collections must be an array');
  return Object.freeze([...new Set(value.map(normalizeCollection))]);
}

function assertNoUserReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoUserReferences(item);
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (USER_REFERENCE_FIELDS.has(key)) {
      throw new ExtensionRestoreFacadeError(
        `restore document contains a forbidden user reference: ${key}`,
        'EXTENSION_RESTORE_USER_REFERENCE_FORBIDDEN'
      );
    }
    assertNoUserReferences(item);
  }
}

module.exports = {
  ExtensionRestoreFacadeError,
  RESTORABLE_COLLECTIONS,
  createExtensionRestoreFacade,
  __testables: {
    USER_REFERENCE_FIELDS,
    assertNoUserReferences,
    normalizeCollection,
    normalizeCollections,
    normalizeObjectId,
    normalizeTenantId
  }
};
