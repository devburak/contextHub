const { mongoose } = require('@contexthub/common');

const EVENT_COLLECTION = 'DomainEvents';
const CURSOR_COLLECTION = 'DomainEventCursors';
const DEAD_LETTER_COLLECTION = 'DomainEventDeadLetters';
const DEFAULT_LEASE_DURATION_MS = 30 * 1000;

class DomainEventConsumerStoreError extends Error {
  constructor(message, code = 'DOMAIN_EVENT_CONSUMER_STORE_ERROR') {
    super(message);
    this.name = 'DomainEventConsumerStoreError';
    this.code = code;
  }
}

class DomainEventConsumerLeaseLostError extends DomainEventConsumerStoreError {
  constructor(message) {
    super(message, 'DOMAIN_EVENT_CONSUMER_LEASE_LOST');
    this.name = 'DomainEventConsumerLeaseLostError';
  }
}

function getConnectedDb() {
  const connection = mongoose.connection;
  if (!connection || !connection.db) {
    throw new DomainEventConsumerStoreError(
      'MongoDB connection is not ready',
      'DOMAIN_EVENT_CONSUMER_DB_NOT_READY'
    );
  }
  return connection.db;
}

function unwrapDocument(result) {
  return result?.value ?? result ?? null;
}

function normalizeTenantId(tenantId) {
  const normalized = String(tenantId ?? '').trim();
  if (!normalized) {
    throw new DomainEventConsumerStoreError(
      'tenantId is required',
      'DOMAIN_EVENT_CONSUMER_TENANT_REQUIRED'
    );
  }
  return normalized;
}

function normalizeOwnerId(ownerId) {
  const normalized = String(ownerId ?? '').trim();
  if (!normalized) {
    throw new DomainEventConsumerStoreError(
      'lease ownerId is required',
      'DOMAIN_EVENT_CONSUMER_OWNER_REQUIRED'
    );
  }
  return normalized;
}

function partitionForTenant(tenantId) {
  return `tenant:${normalizeTenantId(tenantId)}`;
}

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

function assertLeaseMutation(result, action) {
  if (!result?.matchedCount) {
    throw new DomainEventConsumerLeaseLostError(
      `consumer lease was lost before ${action}`
    );
  }
}

function createDomainEventConsumerStore(options = {}) {
  const clock = options.clock || (() => new Date());
  const leaseDurationMs =
    options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs < 1000) {
    throw new DomainEventConsumerStoreError(
      'leaseDurationMs must be an integer of at least 1000'
    );
  }

  const resolveDb = () => options.db || getConnectedDb();
  const collections = () => {
    const db = resolveDb();
    return {
      events: db.collection(EVENT_COLLECTION),
      cursors: db.collection(CURSOR_COLLECTION),
      deadLetters: db.collection(DEAD_LETTER_COLLECTION)
    };
  };

  const timestamp = () => {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new DomainEventConsumerStoreError('clock returned an invalid date');
    }
    return date;
  };

  async function getHighWatermark(tenantId) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const { events } = collections();
    const event = await events.findOne(
      { tenantId: normalizedTenantId, sequence: { $type: 'number' } },
      { sort: { sequence: -1 }, projection: { sequence: 1 } }
    );
    return Number.isSafeInteger(event?.sequence) ? event.sequence : 0;
  }

  async function getCursor(consumer, tenantId) {
    const partition = partitionForTenant(tenantId);
    const { cursors } = collections();
    return cursors.findOne({ consumer, partition });
  }

  async function initializeCursor(registration, tenantId) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const partition = partitionForTenant(normalizedTenantId);
    const { cursors } = collections();
    const existing = await cursors.findOne({
      consumer: registration.name,
      partition
    });
    if (existing) {
      if (existing.initialPosition !== registration.initialPosition) {
        throw new DomainEventConsumerStoreError(
          `consumer initialPosition changed after cursor creation: ${registration.name}`,
          'DOMAIN_EVENT_CONSUMER_CONFIG_DRIFT'
        );
      }
      return existing;
    }

    const now = timestamp();
    const requiresWatermark = registration.initialPosition !== 'earliest';
    const highWatermark = requiresWatermark
      ? await getHighWatermark(normalizedTenantId)
      : null;
    const lastSequence = requiresWatermark ? highWatermark : 0;
    const backfillStatus =
      registration.initialPosition === 'backfill' ? 'pending' : null;
    try {
      await cursors.updateOne(
        { consumer: registration.name, partition },
        {
          $setOnInsert: {
            consumer: registration.name,
            partition,
            active: true,
            initialPosition: registration.initialPosition,
            lastSequence,
            highWatermark,
            backfillStatus,
            backfillCompletedAt: null,
            leaseOwner: null,
            leaseUntil: null,
            failureSequence: null,
            attempt: 0,
            nextAttemptAt: null,
            lastError: null,
            createdAt: now,
            updatedAt: now
          }
        },
        { upsert: true }
      );
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }

    const cursor = await cursors.findOne({
      consumer: registration.name,
      partition
    });
    if (!cursor) {
      throw new DomainEventConsumerStoreError(
        `failed to initialize cursor: ${registration.name}/${partition}`
      );
    }
    if (cursor.initialPosition !== registration.initialPosition) {
      throw new DomainEventConsumerStoreError(
        `consumer initialPosition changed after cursor creation: ${registration.name}`,
        'DOMAIN_EVENT_CONSUMER_CONFIG_DRIFT'
      );
    }
    return cursor;
  }

  async function acquireLease(registration, tenantId, ownerId) {
    const partition = partitionForTenant(tenantId);
    const owner = normalizeOwnerId(ownerId);
    const now = timestamp();
    const leaseUntil = new Date(now.getTime() + leaseDurationMs);
    const { cursors } = collections();
    const result = await cursors.findOneAndUpdate(
      {
        consumer: registration.name,
        partition,
        active: true,
        backfillStatus: { $in: [null, 'completed'] },
        $and: [
          {
            $or: [
              { nextAttemptAt: null },
              { nextAttemptAt: { $exists: false } },
              { nextAttemptAt: { $lte: now } }
            ]
          },
          {
            $or: [
              { leaseOwner: owner },
              { leaseUntil: null },
              { leaseUntil: { $exists: false } },
              { leaseUntil: { $lte: now } }
            ]
          }
        ]
      },
      {
        $set: { leaseOwner: owner, leaseUntil, updatedAt: now }
      },
      { returnDocument: 'after' }
    );

    return unwrapDocument(result);
  }

  async function renewLease(cursor, ownerId, expectedLastSequence) {
    const owner = normalizeOwnerId(ownerId);
    const now = timestamp();
    const leaseUntil = new Date(now.getTime() + leaseDurationMs);
    const { cursors } = collections();
    const result = await cursors.updateOne(
      {
        _id: cursor._id,
        active: true,
        leaseOwner: owner,
        lastSequence: expectedLastSequence
      },
      { $set: { leaseUntil, updatedAt: now } }
    );
    assertLeaseMutation(result, 'renewal');
    return leaseUntil;
  }

  async function releaseLease(cursor, ownerId) {
    const owner = normalizeOwnerId(ownerId);
    const now = timestamp();
    const { cursors } = collections();
    const result = await cursors.updateOne(
      { _id: cursor._id, leaseOwner: owner },
      {
        $set: { leaseOwner: null, leaseUntil: null, updatedAt: now }
      }
    );
    return Boolean(result?.matchedCount);
  }

  async function readEvents(registration, tenantId, lastSequence) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const { events } = collections();
    return events
      .find({
        tenantId: normalizedTenantId,
        type: { $in: registration.types },
        sequence: { $gt: lastSequence }
      })
      .sort({ sequence: 1 })
      .limit(registration.batchSize)
      .toArray();
  }

  async function advanceCursor(
    cursor,
    ownerId,
    expectedLastSequence,
    nextSequence
  ) {
    if (!Number.isSafeInteger(nextSequence) || nextSequence <= expectedLastSequence) {
      throw new DomainEventConsumerStoreError(
        'next cursor sequence must be greater than the current sequence'
      );
    }

    const owner = normalizeOwnerId(ownerId);
    const now = timestamp();
    const { cursors } = collections();
    const result = await cursors.updateOne(
      {
        _id: cursor._id,
        active: true,
        leaseOwner: owner,
        lastSequence: expectedLastSequence
      },
      {
        $set: {
          lastSequence: nextSequence,
          leaseOwner: null,
          leaseUntil: null,
          failureSequence: null,
          attempt: 0,
          nextAttemptAt: null,
          lastError: null,
          updatedAt: now
        }
      }
    );
    assertLeaseMutation(result, 'cursor advancement');
  }

  async function scheduleRetry({
    cursor,
    ownerId,
    expectedLastSequence,
    eventSequence,
    attempt,
    nextAttemptAt,
    error
  }) {
    const owner = normalizeOwnerId(ownerId);
    const now = timestamp();
    const { cursors } = collections();
    const result = await cursors.updateOne(
      {
        _id: cursor._id,
        active: true,
        leaseOwner: owner,
        lastSequence: expectedLastSequence
      },
      {
        $set: {
          failureSequence: eventSequence,
          attempt,
          nextAttemptAt,
          lastError: error,
          leaseOwner: null,
          leaseUntil: null,
          updatedAt: now
        }
      }
    );
    assertLeaseMutation(result, 'retry scheduling');
  }

  async function persistDeadLetter({
    registration,
    cursor,
    tenantId,
    event,
    attempt,
    error
  }) {
    const normalizedTenantId = normalizeTenantId(tenantId);
    const now = timestamp();
    const { deadLetters } = collections();
    await deadLetters.updateOne(
      {
        consumer: registration.name,
        partition: cursor.partition,
        eventSequence: event.sequence
      },
      {
        $setOnInsert: {
          consumer: registration.name,
          partition: cursor.partition,
          eventId: event.id,
          eventSequence: event.sequence,
          tenantId: normalizedTenantId,
          eventType: event.type,
          event,
          failedAt: now,
          resolvedAt: null,
          resolution: null,
          createdAt: now
        },
        $set: { attempts: attempt, error, updatedAt: now }
      },
      { upsert: true }
    );
  }

  async function readDeadLetterSequences(registration, cursor, eventSequences) {
    if (!eventSequences.length) return new Set();
    const { deadLetters } = collections();
    const docs = await deadLetters
      .find(
        {
          consumer: registration.name,
          partition: cursor.partition,
          eventSequence: { $in: eventSequences },
          resolvedAt: null
        },
        { projection: { eventSequence: 1 } }
      )
      .toArray();
    return new Set(docs.map((doc) => doc.eventSequence));
  }

  async function completeBackfill(registration, tenantId, highWatermark) {
    const partition = partitionForTenant(tenantId);
    const now = timestamp();
    const { cursors } = collections();
    const result = await cursors.updateOne(
      {
        consumer: registration.name,
        partition,
        initialPosition: 'backfill',
        backfillStatus: 'pending',
        highWatermark
      },
      {
        $set: {
          backfillStatus: 'completed',
          backfillCompletedAt: now,
          updatedAt: now
        }
      }
    );
    if (!result?.matchedCount) {
      throw new DomainEventConsumerStoreError(
        `backfill cursor did not match high watermark: ${registration.name}/${partition}`,
        'DOMAIN_EVENT_CONSUMER_BACKFILL_MISMATCH'
      );
    }
  }

  return Object.freeze({
    acquireLease,
    advanceCursor,
    completeBackfill,
    getCursor,
    getHighWatermark,
    initializeCursor,
    persistDeadLetter,
    readDeadLetterSequences,
    readEvents,
    releaseLease,
    renewLease,
    scheduleRetry
  });
}

module.exports = {
  CURSOR_COLLECTION,
  DEAD_LETTER_COLLECTION,
  DEFAULT_LEASE_DURATION_MS,
  EVENT_COLLECTION,
  DomainEventConsumerLeaseLostError,
  DomainEventConsumerStoreError,
  createDomainEventConsumerStore,
  partitionForTenant,
  __testables: {
    assertLeaseMutation,
    isDuplicateKeyError,
    normalizeOwnerId,
    normalizeTenantId,
    unwrapDocument
  }
};
