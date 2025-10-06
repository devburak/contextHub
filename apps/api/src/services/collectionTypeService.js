const mongoose = require('mongoose');
const { CollectionType } = require('@contexthub/common');

const ObjectId = mongoose.Types.ObjectId;

function toObjectId(id) {
  if (!id) return undefined;
  if (id instanceof ObjectId) return id;
  return ObjectId.isValid(id) ? new ObjectId(id) : undefined;
}

function assertUniqueFieldKeys(fields = []) {
  const seen = new Set();
  for (const field of fields) {
    if (!field?.key) continue;
    if (seen.has(field.key)) {
      const error = new Error(`Field key '${field.key}' must be unique within the collection`);
      error.code = 'DuplicateFieldKey';
      throw error;
    }
    seen.add(field.key);
  }
}

async function listCollectionTypes({ tenantId, status }) {
  const query = { tenantId };
  if (status) {
    query.status = status;
  }

  const types = await CollectionType.find(query).sort({ createdAt: 1 }).lean();
  return types;
}

async function getCollectionType({ tenantId, key }) {
  const type = await CollectionType.findOne({ tenantId, key });
  if (!type) {
    const error = new Error('Collection type not found');
    error.code = 'CollectionTypeNotFound';
    throw error;
  }
  return type;
}

async function createCollectionType({ tenantId, payload, userId }) {
  assertUniqueFieldKeys(payload.fields);

  const existing = await CollectionType.findOne({ tenantId, key: payload.key });
  if (existing) {
    const error = new Error('Collection key already exists for this tenant');
    error.code = 'DuplicateCollectionKey';
    throw error;
  }

  const doc = new CollectionType({
    tenantId,
    key: payload.key,
    name: payload.name,
    description: payload.description,
    fields: payload.fields || [],
    settings: payload.settings,
    status: payload.status || 'active',
    createdBy: toObjectId(userId),
    updatedBy: toObjectId(userId)
  });

  await doc.save();
  return doc.toObject();
}

async function updateCollectionType({ tenantId, key, payload, userId }) {
  const doc = await CollectionType.findOne({ tenantId, key });
  if (!doc) {
    const error = new Error('Collection type not found');
    error.code = 'CollectionTypeNotFound';
    throw error;
  }

  if (Array.isArray(payload.fields)) {
    assertUniqueFieldKeys(payload.fields);
    doc.fields = payload.fields;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
    doc.name = payload.name;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    doc.description = payload.description;
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'settings')) {
    doc.settings = {
      ...(doc.settings ? doc.settings.toObject?.() || doc.settings : {}),
      ...payload.settings
    };
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'status')) {
    doc.status = payload.status;
  }

  doc.updatedBy = toObjectId(userId) || doc.updatedBy;
  await doc.save();
  return doc.toObject();
}

module.exports = {
  listCollectionTypes,
  getCollectionType,
  createCollectionType,
  updateCollectionType
};
