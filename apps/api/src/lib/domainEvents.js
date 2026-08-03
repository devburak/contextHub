const crypto = require('node:crypto');
const { DOMAIN_EVENT_TYPES, mongoose } = require('@contexthub/common');

const DOMAIN_EVENT_COLLECTION = 'DomainEvents';
const DOMAIN_EVENT_COUNTER_COLLECTION = 'DomainEventCounters';
const DOMAIN_EVENT_COUNTER_ID = 'domainEvents';

function getDb() {
  const connection = mongoose.connection;
  if (!connection || !connection.db) {
    throw new Error('[domainEvents] MongoDB connection is not ready');
  }
  return connection.db;
}

function normalizeTenantId(tenantId) {
  if (!tenantId) {
    return null;
  }
  return typeof tenantId === 'string' ? tenantId : tenantId.toString();
}

async function allocateDomainEventSequence(db, now = new Date()) {
  const result = await db.collection(DOMAIN_EVENT_COUNTER_COLLECTION).findOneAndUpdate(
    { _id: DOMAIN_EVENT_COUNTER_ID },
    {
      $inc: { sequence: 1 },
      $set: { updatedAt: now },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true, returnDocument: 'after' }
  );

  // MongoDB driver 5 returns a ModifyResult; newer drivers may return the document.
  const sequence = result?.value?.sequence ?? result?.sequence;
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('[domainEvents] Failed to allocate a valid event sequence');
  }

  return sequence;
}

async function recordDomainEvent(
  tenantId,
  type,
  payload = {},
  metadata = null,
  dependencies = {}
) {
  const randomUUID = dependencies.randomUUID || crypto.randomUUID;
  const now = dependencies.now ? dependencies.now() : new Date();
  const normalizedTenantId = normalizeTenantId(tenantId);

  if (!normalizedTenantId) {
    console.warn('[domainEvents] Missing tenantId. Event not recorded.');
    return null;
  }

  if (!DOMAIN_EVENT_TYPES.includes(type)) {
    console.warn('[domainEvents] Unknown event type:', type);
    return null;
  }

  const db = dependencies.db || getDb();

  // Counter allocation and event insertion are intentionally separate atomic writes.
  // A failed insert can leave a harmless gap; consumers only require monotonic order.
  const sequence = await allocateDomainEventSequence(db, now);
  const id = randomUUID();

  const doc = {
    _id: id,
    id,
    sequence,
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

  await db.collection(DOMAIN_EVENT_COLLECTION).insertOne(doc);

  return id;
}

async function emitDomainEvent(tenantId, type, payload = {}, metadata = null) {
  return recordDomainEvent(tenantId, type, payload, metadata);
}

module.exports = {
  DOMAIN_EVENT_COLLECTION,
  DOMAIN_EVENT_COUNTER_COLLECTION,
  DOMAIN_EVENT_COUNTER_ID,
  emitDomainEvent,
  __testables: {
    allocateDomainEventSequence,
    normalizeTenantId,
    recordDomainEvent
  }
};
