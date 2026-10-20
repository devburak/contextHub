const crypto = require('node:crypto');
const { fetch } = require('undici');
const { Webhook, DOMAIN_EVENT_TYPES, mongoose } = require('@contexthub/common');
const { runTenantWebhookPipeline } = require('../lib/webhookTrigger');
const {
  signPayload,
  retryAllFailedJobs,
  deleteAllFailedJobs,
  retryJobsByWebhookId,
  deleteJobsByWebhookId
} = require('../lib/webhookDispatcher');
const {
  closeWebhookDispatcher,
  prepareSafeWebhookRequest,
  validateWebhookUrl
} = require('./webhookUrlSecurity');

const webhookServiceDeps = {
  fetch,
  signPayload,
  prepareSafeWebhookRequest,
  recordTestDelivery: (job) => getDb().collection('WebhookOutbox').insertOne(job)
};

const { buildDeliveryRequest, encryptCredentials, normalizeIntegration, publicIntegration, readResponseSnippet } = require('./webhookDelivery');
const { selectEventPayload } = require('../lib/webhooks');
const { visibleWebhooks } = require('./webhookAccess');

const EVENT_SET = new Set(DOMAIN_EVENT_TYPES);
const DEFAULT_MAX_RETRY_ATTEMPTS = Number.isFinite(Number(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS))
  ? Number(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS)
  : 5;
const DEFAULT_RETRY_BACKOFF_MS = Number.isFinite(Number(process.env.WEBHOOK_RETRY_BACKOFF_MS))
  ? Number(process.env.WEBHOOK_RETRY_BACKOFF_MS)
  : 60_000;

function ensureTenantId(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  if (typeof tenantId === 'string') {
    return tenantId;
  }

  if (typeof tenantId.toString === 'function') {
    const value = tenantId.toString();
    if (value && value !== '[object Object]') {
      return value;
    }
  }

  throw new Error('tenantId must be serializable to string');
}

function getDb() {
  const connection = mongoose.connection;
  if (!connection || !connection.db) {
    throw new Error('[webhookService] MongoDB connection is not ready');
  }
  return connection.db;
}

function generateSecret() {
  return crypto.randomBytes(32).toString('hex');
}

function normalizeEvents(eventsInput) {
  if (!Array.isArray(eventsInput) || eventsInput.length === 0) {
    return ['*'];
  }

  const normalized = Array.from(
    new Set(
      eventsInput
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    )
  );

  if (!normalized.length) {
    return ['*'];
  }

  if (normalized.includes('*')) {
    return ['*'];
  }

  const invalid = normalized.filter((type) => !EVENT_SET.has(type));
  if (invalid.length) {
    throw new Error(`Invalid event types: ${invalid.join(', ')}`);
  }

  return normalized;
}

function formatWebhook(doc) {
  if (!doc) {
    return null;
  }

  return {
    id: doc._id.toString(),
    tenantId: doc.tenantId,
    url: !doc.provider || doc.provider === 'webhook' ? doc.url : '',
    provider: doc.provider || 'webhook',
    scope: doc.scope || 'tenant',
    integration: doc.integration || {},
    payloadMode: doc.payloadMode || 'event',
    filters: doc.filters || {},
    consecutiveFailures: doc.consecutiveFailures || 0,
    disabledAt: doc.disabledAt || null,
    notificationPending: Boolean(doc.notificationPending),
    notificationSentAt: doc.notificationSentAt || null,
    isActive: doc.isActive,
    events: doc.events || ['*'],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    hasSecret: (!doc.provider || doc.provider === 'webhook') && Boolean(doc.secret)
  };
}

async function listWebhooks(tenantId, actorId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const docs = await Webhook.find({ tenantId: normalizedTenantId, ...visibleWebhooks(actorId) }).sort({ createdAt: -1 }).lean();
  return docs.map(formatWebhook);
}

function subscriptionOptions(payload) {
  const result = {};
  if (payload.payloadMode !== undefined) {
    if (!['event', 'ids'].includes(payload.payloadMode)) throw new Error('Invalid payloadMode');
    result.payloadMode = payload.payloadMode;
  }
  if (payload.filters !== undefined) {
    result.filters = {};
    for (const key of ['locales', 'environments', 'collectionKeys']) {
      const values = payload.filters?.[key] || [];
      if (!Array.isArray(values) || values.length > 50 || values.some((value) => typeof value !== 'string' || !value.trim() || value.length > 100)) {
        throw new Error(`Invalid filter: ${key}`);
      }
      result.filters[key] = [...new Set(values.map((value) => value.trim()))];
    }
  }
  return result;
}

async function createWebhook(tenantId, payload = {}, options = {}) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const provider = payload.provider || 'webhook';
  if (!['webhook', 'slack', 'telegram', 'whatsapp'].includes(provider)) throw new Error('Invalid integration provider');
  if (provider === 'slack' && !options.slackOAuth) throw new Error('Connect Slack using OAuth');
  const scope = payload.scope || 'tenant';
  if (!['tenant', 'personal'].includes(scope)) throw new Error('Invalid notification scope');
  if (scope === 'personal' && (!options.actorId || provider === 'webhook')) throw new Error('Personal notifications require an authenticated user and a chat provider');
  let config = null;
  if (provider !== 'webhook') config = normalizeIntegration(provider, payload.integration);
  const url = provider === 'webhook' ? validateWebhookUrl(payload.url)
    : `https://integrations.contexthub.invalid/${provider}/${crypto.randomUUID()}`;
  const secret = typeof payload.secret === 'string' && payload.secret.trim() ? payload.secret.trim() : generateSecret();
  const webhook = new Webhook({
    tenantId: normalizedTenantId, url, provider, scope,
    ...(scope === 'personal' ? { ownerUserId: String(options.actorId) } : {}),
    ...(config ? { configEncrypted: encryptCredentials(config, normalizedTenantId), integration: publicIntegration(provider, config) } : {}),
    events: normalizeEvents(payload.events),
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
    secret, ...subscriptionOptions(payload)
  });
  await webhook.save();
  return { webhook: formatWebhook(webhook.toObject()), secret: provider === 'webhook' ? secret : '' };
}

async function updateWebhook(tenantId, webhookId, payload = {}) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const existing = await Webhook.findOne({ _id: webhookId, tenantId: normalizedTenantId }).lean();
  if (!existing) throw new Error('Webhook not found');
  const updates = subscriptionOptions(payload);
  const provider = existing.provider || 'webhook';
  if (payload.integration !== undefined && provider !== 'webhook') {
    if (provider === 'slack') throw new Error('Reconnect Slack using OAuth');
    const config = normalizeIntegration(provider, payload.integration);
    updates.configEncrypted = encryptCredentials(config, normalizedTenantId);
    updates.integration = publicIntegration(provider, config);
  }

  if (payload.url !== undefined && provider === 'webhook') {
    updates.url = validateWebhookUrl(payload.url);
  }

  if (payload.isActive !== undefined) {
    updates.isActive = Boolean(payload.isActive);
    if (updates.isActive) Object.assign(updates, { consecutiveFailures: 0, disabledAt: null, notificationPending: false, notificationSentAt: null });
  }

  if (payload.events !== undefined) {
    updates.events = normalizeEvents(payload.events);
  }

  if (!Object.keys(updates).length) {
    throw new Error('No changes provided');
  }

  const result = await Webhook.findOneAndUpdate(
    { _id: webhookId, tenantId: normalizedTenantId },
    { $set: { ...updates, updatedAt: new Date() } },
    { new: true }
  );

  if (!result) {
    throw new Error('Webhook not found');
  }

  return formatWebhook(result.toObject());
}

async function deleteWebhook(tenantId, webhookId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const result = await Webhook.deleteOne({ _id: webhookId, tenantId: normalizedTenantId });
  return { deleted: result.deletedCount > 0 };
}

async function rotateSecret(tenantId, webhookId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const secret = generateSecret();
  const result = await Webhook.findOneAndUpdate(
    { _id: webhookId, tenantId: normalizedTenantId },
    { $set: { secret } },
    { new: true }
  );

  if (!result) {
    throw new Error('Webhook not found');
  }

  return {
    webhook: formatWebhook(result.toObject()),
    secret
  };
}

function getDomainEventTypes() {
  return DOMAIN_EVENT_TYPES.slice();
}

function mapEventDoc(doc) {
  if (!doc) return null;
  return {
    id: doc.id || (doc._id ? doc._id.toString() : null),
    type: doc.type,
    status: doc.status,
    occurredAt: doc.occurredAt,
    createdAt: doc.createdAt,
    lastError: doc.lastError || null,
    retryCount: doc.retryCount || 0
  };
}

function mapOutboxDoc(doc) {
  if (!doc) return null;
  return {
    id: doc._id ? doc._id.toString() : null,
    webhookId: doc.webhookId ? doc.webhookId.toString() : null,
    eventId: doc.eventId,
    type: doc.type,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    lastError: doc.lastError || null,
    errorType: doc.errorType || null,
    lastHttpStatus: doc.lastHttpStatus || null,
    lastDurationMs: doc.lastDurationMs ?? null,
    nextRetryAt: doc.nextRetryAt || null,
    retryCount: doc.retryCount || 0
  };
}

async function visibleWebhookIds(tenantId, actorId) {
  const docs = await Webhook.find({ tenantId, ...visibleWebhooks(actorId) }).select('_id').lean();
  return docs.map((doc) => doc._id);
}

async function getWebhookQueueStatus(tenantId, options = {}) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 20;
  const db = getDb();
  const eventsCollection = db.collection('DomainEvents');
  const outboxCollection = db.collection('WebhookOutbox');
  const pendingFilter = { tenantId: normalizedTenantId, status: 'pending' };
  const permitted = { tenantId: normalizedTenantId, webhookId: { $in: await visibleWebhookIds(normalizedTenantId, options.actorId) } };
  const pendingJobsFilter = { ...permitted, status: 'pending' };
  const failedFilter = { ...permitted, status: 'failed' };
  const deadFilter = { ...permitted, status: 'dead' };

  const [
    eventCount,
    outboxPendingCount,
    outboxFailedCount,
    outboxDeadCount,
    eventDocs,
    outboxPendingDocs,
    outboxFailedDocs,
    outboxDeadDocs
  ] = await Promise.all([
    eventsCollection.countDocuments(pendingFilter),
    outboxCollection.countDocuments(pendingJobsFilter),
    outboxCollection.countDocuments(failedFilter),
    outboxCollection.countDocuments(deadFilter),
    eventsCollection.find(pendingFilter).sort({ createdAt: 1 }).limit(limit).toArray(),
    outboxCollection.find(pendingJobsFilter).sort({ createdAt: 1 }).limit(limit).toArray(),
    outboxCollection.find(failedFilter).sort({ updatedAt: -1 }).limit(limit).toArray(),
    outboxCollection.find(deadFilter).sort({ updatedAt: -1 }).limit(limit).toArray()
  ]);

  return {
    domainEvents: {
      totalPending: eventCount,
      items: eventDocs.map(mapEventDoc)
    },
    outbox: {
      totalPending: outboxPendingCount,
      totalFailed: outboxFailedCount,
      totalDead: outboxDeadCount,
      pendingItems: outboxPendingDocs.map(mapOutboxDoc),
      failedItems: outboxFailedDocs.map(mapOutboxDoc),
      deadItems: outboxDeadDocs.map(mapOutboxDoc)
    }
  };
}

async function triggerTenantWebhooks(tenantId, options = {}) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const domainEventLimit = Number.isFinite(options.domainEventLimit) && options.domainEventLimit > 0
    ? options.domainEventLimit
    : undefined;
  const webhookLimit = Number.isFinite(options.webhookLimit) && options.webhookLimit > 0
    ? options.webhookLimit
    : undefined;
  const maxRetryAttempts = Number.isFinite(options.maxRetryAttempts) && options.maxRetryAttempts > 0
    ? options.maxRetryAttempts
    : DEFAULT_MAX_RETRY_ATTEMPTS;
  const retryBackoffMs = Number.isFinite(options.retryBackoffMs) && options.retryBackoffMs >= 0
    ? options.retryBackoffMs
    : DEFAULT_RETRY_BACKOFF_MS;

  return runTenantWebhookPipeline({
    tenantId: normalizedTenantId,
    domainEventLimit,
    webhookLimit,
    maxRetryAttempts,
    retryBackoffMs
  });
}

async function sendTestWebhook(tenantId, webhookId, payloadOverride = null) {
  const normalizedTenantId = ensureTenantId(tenantId);
  if (!webhookId) {
    throw new Error('webhookId is required');
  }

  const webhook = await Webhook.findOne({ _id: webhookId, tenantId: normalizedTenantId }).lean();
  if (!webhook || !webhook.isActive) {
    throw new Error('Webhook not found or inactive');
  }

  const now = new Date();
  const sentAt = now.toISOString();
  const payload = payloadOverride && typeof payloadOverride === 'object' && payloadOverride !== null
    ? payloadOverride
    : {
        message: 'contextHub manuel webhook testi',
        sentAt,
        tenantId: normalizedTenantId
      };

  const eventId = crypto.randomUUID();
  const metadata = {
    triggeredBy: 'user',
    source: 'admin-ui',
    test: true,
    webhookId: webhookId.toString(),
    requestId: crypto.randomUUID()
  };

  const domainEventPayload = {
    _id: eventId,
    id: eventId,
    tenantId: normalizedTenantId,
    type: 'webhook.test',
    occurredAt: sentAt,
    payload,
    metadata,
    status: 'pending',
    retryCount: 0,
    lastError: null,
    createdAt: sentAt,
    updatedAt: sentAt
  };

  const selectedPayload = selectEventPayload(domainEventPayload, webhook.payloadMode);
  const startTime = Date.now();
  const signal = AbortSignal.timeout(5000);
  let delivery;
  let prepared;
  let response;
  let responseBody = null;
  let failure = null;
  const generic = !webhook.provider || webhook.provider === 'webhook';
  try {
    delivery = buildDeliveryRequest(webhook, selectedPayload, { signPayload: webhookServiceDeps.signPayload });
    prepared = await webhookServiceDeps.prepareSafeWebhookRequest(delivery.url, { signal });
    response = await webhookServiceDeps.fetch(prepared.url, {
      method: 'POST', headers: delivery.headers, body: delivery.body,
      redirect: 'error', dispatcher: prepared.dispatcher, signal
    });
    const snippet = await readResponseSnippet(response, webhook.provider === 'telegram' ? 16384 : 2048);
    responseBody = generic ? snippet : null;
    if (webhook.provider === 'telegram') {
      let data;
      try { data = JSON.parse(snippet); } catch { throw new Error('Invalid provider response'); }
      if (!data.ok) throw new Error(`Test webhook failed with HTTP ${Number(data.error_code) || response.status}`);
    }
    if (!response.ok) throw new Error(`Test webhook failed with HTTP ${response.status}`);
  } catch (error) {
    failure = generic ? error : new Error(`Integration test failed (${response?.status || 'connection error'})`);
  } finally {
    await closeWebhookDispatcher(prepared?.dispatcher);
  }
  const durationMs = Date.now() - startTime;
  await webhookServiceDeps.recordTestDelivery({
    tenantId: normalizedTenantId, webhookId: webhook._id, eventId, type: 'webhook.test',
    dedupeKey: `${normalizedTenantId}:${webhook._id}:${eventId}`, payload: selectedPayload,
    // Test failures are shown in history but never retried automatically.
    status: failure ? 'dead' : 'done', retryCount: failure ? 1 : 0,
    lastError: failure?.message?.slice(0, 500) || null,
    lastHttpStatus: response?.status || null, lastDurationMs: durationMs,
    nextRetryAt: null, createdAt: now, updatedAt: new Date(),
    attempts: [{ at: now, status: response?.status || null, durationMs,
      error: failure?.message?.slice(0, 500) || null,
      requestBody: generic ? delivery?.body?.slice(0, 4096) || null : null,
      responseBody, timestamp: delivery?.headers?.['X-CTXHUB-TIMESTAMP'] || null }]
  });
  if (failure) throw failure;

  return { ok: true, status: response.status, responseBody };
}

async function getDeliveries(tenantId, { limit = 30, webhookId, actorId } = {}) {
  const filter = { tenantId: ensureTenantId(tenantId) };
  const ids = await visibleWebhookIds(filter.tenantId, actorId);
  filter.webhookId = { $in: webhookId ? ids.filter((id) => String(id) === webhookId) : ids };
  const docs = await getDb().collection('WebhookOutbox').find(filter).sort({ updatedAt: -1, createdAt: -1 }).limit(Math.min(100, limit)).toArray();
  return { items: docs.map((doc) => ({ ...mapOutboxDoc(doc), attempts: doc.attempts || [] })) };
}

async function replayDelivery(tenantId, deliveryId, actorId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const outbox = getDb().collection('WebhookOutbox');
  const job = await outbox.findOne({ _id: new mongoose.Types.ObjectId(deliveryId), tenantId: normalizedTenantId });
  if (!job) throw new Error('Delivery not found');
  const hook = await Webhook.findOne({ _id: job.webhookId, tenantId: normalizedTenantId, isActive: true, ...visibleWebhooks(actorId) }).lean();
  if (!hook) throw new Error('Webhook not found or inactive');
  const result = await outbox.updateOne({ _id: job._id, tenantId: normalizedTenantId, status: { $in: ['done', 'failed', 'dead'] } }, {
    $set: { status: 'pending', retryCount: 0, nextRetryAt: null, lastError: null, updatedAt: new Date() }
  });
  if (!result.modifiedCount) throw new Error('Delivery is already pending or processing');
  return { ok: true };
}

function __setWebhookServiceDeps(overrides = {}) {
  webhookServiceDeps.recordTestDelivery = overrides.recordTestDelivery || ((job) => getDb().collection('WebhookOutbox').insertOne(job));
  webhookServiceDeps.fetch = overrides.fetch || fetch;
  webhookServiceDeps.signPayload = overrides.signPayload || signPayload;
  webhookServiceDeps.prepareSafeWebhookRequest = overrides.prepareSafeWebhookRequest
    || prepareSafeWebhookRequest;
}

/**
 * Tenant'ın tüm başarısız webhook işlerini yeniden kuyruğa al
 */
async function bulkRetryAllFailed(tenantId, actorId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  return retryAllFailedJobs(normalizedTenantId, await visibleWebhookIds(normalizedTenantId, actorId));
}

/**
 * Tenant'ın tüm başarısız webhook işlerini sil
 */
async function bulkDeleteAllFailed(tenantId, actorId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  return deleteAllFailedJobs(normalizedTenantId, await visibleWebhookIds(normalizedTenantId, actorId));
}

/**
 * Belirli bir webhook için başarısız işleri yeniden kuyruğa al
 */
async function bulkRetryByWebhook(tenantId, webhookId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  if (!webhookId) {
    throw new Error('webhookId is required');
  }
  return retryJobsByWebhookId(normalizedTenantId, webhookId);
}

/**
 * Belirli bir webhook için başarısız işleri sil
 */
async function bulkDeleteByWebhook(tenantId, webhookId, options = {}) {
  const normalizedTenantId = ensureTenantId(tenantId);
  if (!webhookId) {
    throw new Error('webhookId is required');
  }
  return deleteJobsByWebhookId(normalizedTenantId, webhookId, options);
}

module.exports = {
  getDeliveries,
  replayDelivery,
  createWebhook,
  deleteWebhook,
  getWebhookQueueStatus,
  getDomainEventTypes,
  listWebhooks,
  rotateSecret,
  sendTestWebhook,
  triggerTenantWebhooks,
  updateWebhook,
  // Bulk operasyonlar
  bulkRetryAllFailed,
  bulkDeleteAllFailed,
  bulkRetryByWebhook,
  bulkDeleteByWebhook,
  __setWebhookServiceDeps
};
