const crypto = require('node:crypto');
const { DOMAIN_EVENT_TYPES, mongoose } = require('@contexthub/common');

const DOMAIN_EVENT_COLLECTION = 'DomainEvents';

function getDb() {
  const connection = mongoose.connection;
  if (!connection || !connection.db) {
    throw new Error('[domainEvents] MongoDB connection is not ready');
  }
  return connection.db;
}

function getCollection(name = DOMAIN_EVENT_COLLECTION) {
  return getDb().collection(name);
}

function normalizeTenantId(tenantId) {
  if (!tenantId) {
    return null;
  }
  return typeof tenantId === 'string' ? tenantId : tenantId.toString();
}

async function emitDomainEvent(tenantId, type, payload = {}, metadata = null) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  if (!normalizedTenantId) {
    console.warn('[domainEvents] Missing tenantId. Event not recorded.');
    return null;
  }

  if (!DOMAIN_EVENT_TYPES.includes(type)) {
    console.warn('[domainEvents] Unknown event type:', type);
    return null;
  }

  const id = crypto.randomUUID();
  const now = new Date();

  const doc = {
    _id: id,
    id,
    tenantId: normalizedTenantId,
    type,
    occurredAt: now.toISOString(),
    payload: payload && typeof payload === 'object' ? { ...payload } : {},
    metadata: metadata && Object.keys(metadata).length ? { ...metadata } : null,
    status: 'pending',
    retryCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now
  };

  const collection = getCollection();
  await collection.insertOne(doc);

  return id;
}

module.exports = {
  DOMAIN_EVENT_COLLECTION,
  emitDomainEvent
};
