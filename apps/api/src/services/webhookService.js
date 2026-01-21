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

const webhookServiceDeps = {
  fetch,
  signPayload
};

const EVENT_SET = new Set(DOMAIN_EVENT_TYPES);
const MAX_TEST_LOG_BODY_LENGTH = 500;
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

async function readResponseSnippet(response) {
  if (!response || typeof response.text !== 'function') {
    return null;
  }
  try {
    const text = await response.text();
    if (!text) return null;
    if (text.length <= MAX_TEST_LOG_BODY_LENGTH) {
      return text;
    }
    return `${text.slice(0, MAX_TEST_LOG_BODY_LENGTH)}…`;
  } catch (error) {
    return null;
  }
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

function validateUrl(value) {
  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new Error('Webhook URL is required');
  }
  try {
    new URL(value.trim());
  } catch (error) {
    throw new Error('Webhook URL is invalid');
  }
  return value.trim();
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
    url: doc.url,
    isActive: doc.isActive,
    events: doc.events || ['*'],
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    hasSecret: Boolean(doc.secret)
  };
}

async function listWebhooks(tenantId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const docs = await Webhook.find({ tenantId: normalizedTenantId }).sort({ createdAt: -1 }).lean();
  return docs.map(formatWebhook);
}

async function createWebhook(tenantId, payload = {}) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const url = validateUrl(payload.url);
  const events = normalizeEvents(payload.events);
  const isActive = payload.isActive !== undefined ? Boolean(payload.isActive) : true;
  const secret = payload.secret && payload.secret.trim() ? payload.secret.trim() : generateSecret();

  const webhook = new Webhook({
    tenantId: normalizedTenantId,
    url,
    events,
    isActive,
    secret
  });

  await webhook.save();

  return {
    webhook: formatWebhook(webhook.toObject()),
    secret
  };
}

async function updateWebhook(tenantId, webhookId, payload = {}) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const updates = {};

  if (payload.url !== undefined) {
    updates.url = validateUrl(payload.url);
  }

  if (payload.isActive !== undefined) {
    updates.isActive = Boolean(payload.isActive);
  }

  if (payload.events !== undefined) {
    updates.events = normalizeEvents(payload.events);
  }

  if (!Object.keys(updates).length) {
    throw new Error('No changes provided');
  }

  const result = await Webhook.findOneAndUpdate(
    { _id: webhookId, tenantId: normalizedTenantId },
    { $set: updates },
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
    lastDurationMs: doc.lastDurationMs || null,
    nextRetryAt: doc.nextRetryAt || null,
    retryCount: doc.retryCount || 0
  };
}

async function getWebhookQueueStatus(tenantId, options = {}) {
  const normalizedTenantId = ensureTenantId(tenantId);
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 20;
  const db = getDb();
  const eventsCollection = db.collection('DomainEvents');
  const outboxCollection = db.collection('WebhookOutbox');
  const pendingFilter = { tenantId: normalizedTenantId, status: 'pending' };
  const failedFilter = { tenantId: normalizedTenantId, status: 'failed' };
  const deadFilter = { tenantId: normalizedTenantId, status: 'dead' };

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
    outboxCollection.countDocuments(pendingFilter),
    outboxCollection.countDocuments(failedFilter),
    outboxCollection.countDocuments(deadFilter),
    eventsCollection.find(pendingFilter).sort({ createdAt: 1 }).limit(limit).toArray(),
    outboxCollection.find(pendingFilter).sort({ createdAt: 1 }).limit(limit).toArray(),
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

  const body = JSON.stringify(domainEventPayload);
  const signature = webhookServiceDeps.signPayload(webhook.secret, body);
  const startTime = Date.now();
  const response = await webhookServiceDeps.fetch(webhook.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CTXHUB-SIGNATURE': signature,
      'X-CTXHUB-EVENT': domainEventPayload.type
    },
    body,
    signal: typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(5000)
      : undefined
  });
  const durationMs = Date.now() - startTime;
  const responseBody = await readResponseSnippet(response);

  if (!response.ok) {
    console.error('[webhookService] Test webhook failed', {
      tenantId: normalizedTenantId,
      webhookId: webhookId.toString(),
      status: response.status,
      durationMs,
      responseBody
    });
    throw new Error(`Test webhook failed with HTTP ${response.status}`);
  }

  console.info('[webhookService] Test webhook delivered', {
    tenantId: normalizedTenantId,
    webhookId: webhookId.toString(),
    status: response.status,
    durationMs,
    responseBody
  });

  return { ok: true, status: response.status, responseBody };
}

function __setWebhookServiceDeps(overrides = {}) {
  webhookServiceDeps.fetch = overrides.fetch || fetch;
  webhookServiceDeps.signPayload = overrides.signPayload || signPayload;
}

/**
 * Tenant'ın tüm başarısız webhook işlerini yeniden kuyruğa al
 */
async function bulkRetryAllFailed(tenantId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  return retryAllFailedJobs(normalizedTenantId);
}

/**
 * Tenant'ın tüm başarısız webhook işlerini sil
 */
async function bulkDeleteAllFailed(tenantId) {
  const normalizedTenantId = ensureTenantId(tenantId);
  return deleteAllFailedJobs(normalizedTenantId);
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
