const { mongoose } = require('@contexthub/common');
const { buildWebhookOutboxJobs } = require('./webhooks');

const DEFAULT_BATCH_LIMIT = 50;

const ObjectId = mongoose.Types.ObjectId;
const tenantSlugCache = new Map();

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
    outbox: db.collection('WebhookOutbox'),
    tenants: db.collection('tenants')
  };
}

function normalizeTenantIdValue(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value.toString === 'function') {
    const resolved = value.toString();
    if (resolved && resolved !== '[object Object]') {
      return resolved;
    }
  }
  return null;
}

async function lookupTenantSlug(tenantIdString, tenantsCollection) {
  if (!tenantIdString || !tenantsCollection) {
    return null;
  }

  if (tenantSlugCache.has(tenantIdString)) {
    return tenantSlugCache.get(tenantIdString);
  }

  let doc = null;

  if (ObjectId.isValid(tenantIdString)) {
    doc = await tenantsCollection.findOne(
      { _id: new ObjectId(tenantIdString) },
      { projection: { slug: 1 } }
    );
  }

  if (!doc) {
    doc = await tenantsCollection.findOne(
      { slug: tenantIdString },
      { projection: { slug: 1 } }
    );
  }

  const slug = doc?.slug || null;
  tenantSlugCache.set(tenantIdString, slug);
  return slug;
}

async function buildTenantMatchValues(tenantId, options = {}) {
  const normalized = normalizeTenantIdValue(tenantId);
  if (normalized === null) {
    return [null];
  }

  const values = new Set([normalized]);

  if (typeof normalized === 'string' && ObjectId.isValid(normalized)) {
    values.add(new ObjectId(normalized));
    const slug = typeof options.findTenantSlug === 'function'
      ? await options.findTenantSlug(normalized)
      : null;
    if (slug) {
      values.add(slug);
    }
  }

  return Array.from(values);
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

  const { events, webhooks, outbox, tenants } = resolveCollections();

  const query = { status: 'pending' };
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
    const lock = await events.updateOne(
      { _id: event._id, status: 'pending' },
      { $set: { status: 'processing', updatedAt: now(), lastError: null } }
    );

    if (!lock.matchedCount || !lock.modifiedCount) {
      skipped += 1;
      continue;
    }

    try {
      const tenantMatchValues = await buildTenantMatchValues(event.tenantId, {
        findTenantSlug: (id) => lookupTenantSlug(id, tenants)
      });
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

      await outbox.insertMany(jobs);
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
    buildTenantMatchValues,
    normalizeTenantIdValue
  }
};
