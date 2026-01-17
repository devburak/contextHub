const mongoose = require('mongoose');
const { CollectionType } = require('@contexthub/common');
const { emitDomainEvent } = require('../lib/domainEvents');
const { triggerWebhooksForTenant } = require('../lib/webhookTrigger');

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

function buildCollectionEventPayload(collectionDoc) {
  if (!collectionDoc) return null;
  const doc = typeof collectionDoc.toObject === 'function'
    ? collectionDoc.toObject({ depopulate: true })
    : collectionDoc;

  const payload = {
    collectionId: doc._id ? doc._id.toString() : null,
    key: doc.key,
    name: doc.name,
    description: doc.description,
    fields: doc.fields,
    settings: doc.settings,
    status: doc.status,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : undefined,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : new Date().toISOString()
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === null) {
      delete payload[key];
    }
  });

  return payload;
}

async function emitCollectionEvent({ tenantId, type, collection, userId }) {
  if (!tenantId || !type || !collection) return;

  const normalizedUserId = userId ? userId.toString() : null;
  const metadata = {
    triggeredBy: normalizedUserId ? 'user' : 'system',
    source: 'admin-ui'
  };

  if (normalizedUserId) {
    metadata.userId = normalizedUserId;
  }

  try {
    const payload = buildCollectionEventPayload(collection) || {};
    const eventId = await emitDomainEvent(tenantId, type, payload, metadata);
    if (eventId) {
      triggerWebhooksForTenant(tenantId);
    }
  } catch (error) {
    console.error('[collectionTypeService] Failed to emit domain event', { tenantId, type, error });
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
  await emitCollectionEvent({
    tenantId,
    type: 'collection.created',
    collection: doc,
    userId
  });
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
  await emitCollectionEvent({
    tenantId,
    type: 'collection.updated',
    collection: doc,
    userId
  });
  return doc.toObject();
}

module.exports = {
  listCollectionTypes,
  getCollectionType,
  createCollectionType,
  updateCollectionType
};
