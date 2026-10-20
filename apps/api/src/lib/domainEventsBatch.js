const { mongoose } = require('@contexthub/common');
const { buildWebhookOutboxJobs } = require('./webhooks');
const { purgeTenantCacheForDomainEvent } = require('../services/edgeCachePurgeService');

const DEFAULT_BATCH_LIMIT = 50;
// Events locked to 'processing' for longer than this are considered orphaned
// (the worker crashed/restarted mid-batch) and are reclaimed for reprocessing.
const STALE_PROCESSING_MS = (() => {
  const parsed = Number.parseInt(process.env.DOMAIN_EVENT_STALE_PROCESSING_MS, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2 * 60 * 1000;
})();

const ObjectId = mongoose.Types.ObjectId;
const { tenantKey } = require('./webhookTenant');

function now() {
  return new Date();
}

function ensureDbConnection() {
  const connection = mongoose.connection;
  if (!connection || !connection.db) {
    throw new Error('[domainEventsBatch] MongoDB connection is not ready');
  }
  return connection.db;
}

function resolveCollections() {
  const db = ensureDbConnection();
  return {
    events: db.collection('DomainEvents'),
    webhooks: db.collection('webhooks'),
    outbox: db.collection('WebhookOutbox')
  };
}

async function buildTenantMatchValues(tenantId) {
  const normalized = tenantKey(tenantId);
  if (normalized === null) return [];
  return ObjectId.isValid(normalized) ? [normalized, new ObjectId(normalized)] : [normalized];
}

/**
 * Move pending DomainEvents into the webhook outbox.
 *
 * @param {Object} [options]
 * @param {number} [options.limit=50]
 * @param {string} [options.tenantId]
 */
async function processDomainEventsBatch(options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : DEFAULT_BATCH_LIMIT;
  const tenantId = options.tenantId || null;

  const { events, webhooks, outbox } = resolveCollections();

  const staleProcessingBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const query = {
    $or: [
      { status: 'pending' },
      // Reclaim events orphaned in 'processing' by a crashed/restarted worker.
      { status: 'processing', updatedAt: { $lt: staleProcessingBefore } }
    ]
  };
  if (tenantId) {
    query.tenantId = tenantId;
  }

  const docs = await events
    .find(query)
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  if (!docs.length) {
    return { processed: 0, queued: 0, skipped: 0, failed: 0 };
  }

  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const event of docs) {
    // Compare-and-swap on updatedAt so concurrent workers cannot grab the same
    // event twice, while still allowing reclaim of stale 'processing' locks.
    const lock = await events.updateOne(
      {
        _id: event._id,
        status: { $in: ['pending', 'processing'] },
        updatedAt: event.updatedAt
      },
      { $set: { status: 'processing', updatedAt: now(), lastError: null } }
    );

    if (!lock.matchedCount || !lock.modifiedCount) {
      skipped += 1;
      continue;
    }

    try {
      try {
        await purgeTenantCacheForDomainEvent(event);
      } catch (error) {
        // Cache entries also have a short TTL, so purge failures must not block
        // tenant webhooks or leave the domain event stuck in processing.
        console.error('[domainEventsBatch] Edge cache purge failed', {
          tenantId: event.tenantId,
          eventId: event.id,
          eventType: event.type,
          errorName: error?.name || 'Error'
        });
      }

      const tenantMatchValues = await buildTenantMatchValues(event.tenantId);
      const hookQuery = {
        tenantId: { $in: tenantMatchValues },
        isActive: true
      };

      const hooks = await webhooks.find(hookQuery).toArray();

      if (!hooks.length) {
        skipped += 1;
        const candidateHooks = await webhooks
          .find({ tenantId: { $in: tenantMatchValues } })
          .project({ _id: 1, tenantId: 1, isActive: 1, events: 1 })
          .limit(5)
          .toArray();

        console.warn('[domainEventsBatch] No active webhooks found for tenant', {
          tenantId: event.tenantId,
          eventId: event.id,
          identifiersTried: tenantMatchValues,
          candidatesFound: candidateHooks.length,
          candidateSample: candidateHooks
        });
        await events.updateOne(
          { _id: event._id },
          { $set: { status: 'skipped', updatedAt: now(), lastError: 'No active webhooks' } }
        );
        continue;
      }

      const jobs = buildWebhookOutboxJobs(event, hooks);
      if (!jobs.length) {
        skipped += 1;
        await events.updateOne(
          { _id: event._id },
          { $set: { status: 'skipped', updatedAt: now(), lastError: 'No subscribed webhooks' } }
        );
        continue;
      }

      // Reprocessing an event after a crash must not create duplicate deliveries.
      await outbox.bulkWrite(jobs.map((job) => ({ updateOne: {
        filter: { tenantId: job.tenantId, webhookId: job.webhookId, eventId: job.eventId },
        update: { $setOnInsert: job }, upsert: true
      } })), { ordered: false });
      queued += jobs.length;
      await events.updateOne(
        { _id: event._id },
        { $set: { status: 'queued', updatedAt: now(), lastError: null } }
      );
    } catch (error) {
      failed += 1;
      console.error('[domainEventsBatch] Failed to process event', {
        tenantId: event.tenantId,
        eventId: event.id,
        error
      });
      await events.updateOne(
        { _id: event._id },
        {
          $set: {
            status: 'pending',
            updatedAt: now(),
            lastError: error?.message || 'Failed to queue webhooks'
          },
          $inc: { retryCount: 1 }
        }
      );
    }
  }

  return {
    processed: docs.length,
    queued,
    skipped,
    failed
  };
}

module.exports = {
  DEFAULT_BATCH_LIMIT,
  processDomainEventsBatch,
  __testables: {
    buildTenantMatchValues
  }
};
