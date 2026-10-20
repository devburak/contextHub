const crypto = require('node:crypto');
const { fetch } = require('undici');
const { mongoose } = require('@contexthub/common');
const {
  closeWebhookDispatcher,
  prepareSafeWebhookRequest
} = require('../services/webhookUrlSecurity');

const DEFAULT_BATCH_LIMIT = 50;
const { buildDeliveryRequest, readResponseSnippet } = require('../services/webhookDelivery');
const { notifyDisabledWebhooks, recordWebhookHealth } = require('../services/webhookHealth');
const { canDeliverWebhook } = require('../services/webhookAccess');
const { assertWebhookTenant } = require('./webhookTenant');
const dispatcherDeps = { fetch, prepareSafeWebhookRequest, notifyDisabledWebhooks, recordWebhookHealth, canDeliverWebhook };
const DEFAULT_MAX_RETRY_ATTEMPTS = Number.isFinite(Number(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS))
  ? Number(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS)
  : 5;
const DEFAULT_BASE_BACKOFF_MS = Number.isFinite(Number(process.env.WEBHOOK_BASE_BACKOFF_MS))
  ? Number(process.env.WEBHOOK_BASE_BACKOFF_MS)
  : 60_000; // 1 dakika
const DEFAULT_MAX_BACKOFF_MS = Number.isFinite(Number(process.env.WEBHOOK_MAX_BACKOFF_MS))
  ? Number(process.env.WEBHOOK_MAX_BACKOFF_MS)
  : 3600_000; // 1 saat
const DEFAULT_FAILED_CLEANUP_MS = Number.isFinite(Number(process.env.WEBHOOK_FAILED_CLEANUP_MS))
  ? Number(process.env.WEBHOOK_FAILED_CLEANUP_MS)
  : 7 * 24 * 60 * 60 * 1000;

// Hata Sınıflandırması
const ERROR_TYPES = {
  TRANSIENT: 'transient',   // Geçici hatalar - retry yapılmalı (5xx, network errors)
  PERMANENT: 'permanent',   // Kalıcı hatalar - retry yapılmamalı (4xx, invalid URL)
  TIMEOUT: 'timeout'        // Timeout hataları - retry yapılmalı (uzun backoff ile)
};

/**
 * HTTP durum koduna göre hata tipini belirle
 * @param {number|null} statusCode
 * @param {Error|null} error
 * @returns {string} ERROR_TYPES değerlerinden biri
 */
function classifyError(statusCode, error) {
  if (['WEBHOOK_URL_BLOCKED', 'WEBHOOK_TENANT_MISMATCH', 'WEBHOOK_ACCESS_REVOKED'].includes(error?.code)) {
    return ERROR_TYPES.PERMANENT;
  }
  // Timeout hatası
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError' || error?.code === 'UND_ERR_CONNECT_TIMEOUT' || error?.message?.includes('timeout')) {
    return ERROR_TYPES.TIMEOUT;
  }

  // Network hataları - geçici
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'ECONNRESET') {
    return ERROR_TYPES.TRANSIENT;
  }

  // HTTP durum kodlarına göre sınıflandırma
  if (statusCode) {
    // 4xx - Client hataları (kalıcı)
    // 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 405 Method Not Allowed
    // 410 Gone, 422 Unprocessable Entity
    if (statusCode >= 400 && statusCode < 500) {
      // 408 Request Timeout ve 429 Too Many Requests geçici kabul edilir
      if (statusCode === 408 || statusCode === 429) {
        return ERROR_TYPES.TRANSIENT;
      }
      return ERROR_TYPES.PERMANENT;
    }

    // 5xx - Server hataları (geçici)
    if (statusCode >= 500) {
      return ERROR_TYPES.TRANSIENT;
    }
  }

  // Bilinmeyen hatalar geçici kabul edilir
  return ERROR_TYPES.TRANSIENT;
}

/**
 * Exponential backoff hesapla (jitter ile)
 * Formula: min(maxBackoff, baseBackoff * 2^retryCount) + random jitter
 * @param {number} retryCount - Mevcut retry sayısı
 * @param {number} baseBackoffMs - Temel bekleme süresi (ms)
 * @param {number} maxBackoffMs - Maksimum bekleme süresi (ms)
 * @param {string} errorType - Hata tipi
 * @returns {number} Bekleme süresi (ms)
 */
function calculateBackoff(retryCount, baseBackoffMs = DEFAULT_BASE_BACKOFF_MS, maxBackoffMs = DEFAULT_MAX_BACKOFF_MS, errorType = ERROR_TYPES.TRANSIENT) {
  // Timeout hataları için daha uzun backoff
  const multiplier = errorType === ERROR_TYPES.TIMEOUT ? 2 : 1;
  const baseDelay = baseBackoffMs * multiplier;

  // Exponential: baseDelay * 2^retryCount
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);

  // Max backoff ile sınırla
  const cappedDelay = Math.min(exponentialDelay, maxBackoffMs);

  // Jitter ekle (%0-25 arası rastgele)
  const jitter = cappedDelay * Math.random() * 0.25;

  return Math.floor(Math.min(maxBackoffMs, cappedDelay + jitter));
}

/**
 * Bir sonraki retry zamanını hesapla
 * @param {number} retryCount
 * @param {string} errorType
 * @param {number} baseBackoffMs
 * @param {number} maxBackoffMs
 * @returns {Date}
 */
function calculateNextRetryAt(retryCount, errorType, baseBackoffMs, maxBackoffMs) {
  const backoffMs = calculateBackoff(retryCount, baseBackoffMs, maxBackoffMs, errorType);
  return new Date(Date.now() + backoffMs);
}

function ensureDbConnection() {
  const connection = mongoose.connection;
  if (!connection || !connection.db) {
    throw new Error('[webhookDispatcher] MongoDB connection is not ready');
  }
  return connection.db;
}

function resolveMaxAttempts(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_MAX_RETRY_ATTEMPTS;
}

function resolveBaseBackoffMs(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return DEFAULT_BASE_BACKOFF_MS;
}

function resolveMaxBackoffMs(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return DEFAULT_MAX_BACKOFF_MS;
}

function resolveCleanupThresholdMs(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return DEFAULT_FAILED_CLEANUP_MS;
}

function resolveCollections() {
  const db = ensureDbConnection();
  return {
    outbox: db.collection('WebhookOutbox'),
    webhooks: db.collection('webhooks')
  };
}

function signPayload(secret, body) {
  if (!secret) {
    return '';
  }
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function resolveAbortSignal(timeoutMs = 15000) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  return undefined;
}

function parseRetryAfter(value, now = Date.now()) {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(delay) ? Math.min(24 * 3600_000, Math.max(0, delay)) : 0;
}

async function dispatchWebhookOutboxBatch(options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : DEFAULT_BATCH_LIMIT;
  const tenantId = options.tenantId || null;
  const maxAttempts = resolveMaxAttempts(options.maxAttempts);
  const baseBackoffMs = resolveBaseBackoffMs(options.baseBackoffMs);
  const maxBackoffMs = resolveMaxBackoffMs(options.maxBackoffMs);
  const { outbox, webhooks } = resolveCollections();
  // Every entry point (scheduler, CLI, cron, manual trigger) processes due retries.
  await retryFailedWebhookJobs({ tenantId, maxAttempts });
  try { await dispatcherDeps.notifyDisabledWebhooks(webhooks, tenantId); }
  catch { console.error('[webhookDispatcher] Health notification scan failed'); }
  const staleBefore = new Date(Date.now() - 120_000);
  const query = { $or: [
    { status: 'pending' },
    { status: 'processing', updatedAt: { $lt: staleBefore } }
  ] };
  if (tenantId) query.tenantId = tenantId;
  const jobs = await outbox.find(query).sort({ createdAt: 1 }).limit(limit).toArray();
  const result = { processed: jobs.length, succeeded: 0, failed: 0, skipped: 0, dead: 0 };
  for (const job of jobs) {
    const leaseToken = crypto.randomUUID();
    const lock = await outbox.updateOne(
      { _id: job._id, tenantId: job.tenantId, status: job.status, updatedAt: job.updatedAt ?? null },
      { $set: { status: 'processing', leaseToken, updatedAt: new Date() } }
    );
    if (!lock.modifiedCount) { result.skipped++; continue; }
    const owned = { _id: job._id, tenantId: job.tenantId, status: 'processing', leaseToken };
    const webhook = await webhooks.findOne({ _id: job.webhookId, tenantId: job.tenantId });
    if (!webhook || !webhook.isActive) {
      result.skipped++;
      await outbox.updateOne(owned, { $set: { status: 'dead', leaseToken: null, updatedAt: new Date(), lastError: 'Webhook not found or inactive', nextRetryAt: null } });
      continue;
    }
    const startedAt = new Date();
    let responseStatus = null;
    let responseBody = null;
    let request = null;
    let retryAfterMs = 0;
    let failure = null;
    try {
      assertWebhookTenant(job.tenantId, webhook.tenantId);
      assertWebhookTenant(job.tenantId, job.payload?.tenantId);
      if (!await dispatcherDeps.canDeliverWebhook(webhook)) {
        const error = new Error('Webhook recipient access revoked');
        error.code = 'WEBHOOK_ACCESS_REVOKED';
        throw error;
      }
      request = buildDeliveryRequest(webhook, job.payload || {}, { signPayload });
      const signal = resolveAbortSignal(Math.min(60_000, options.timeoutMs || 15000));
      const prepared = await dispatcherDeps.prepareSafeWebhookRequest(request.url, { signal });
      try {
        const response = await dispatcherDeps.fetch(prepared.url, {
          method: 'POST', headers: request.headers, body: request.body,
          redirect: 'error', dispatcher: prepared.dispatcher, signal
        });
        responseStatus = response.status;
        retryAfterMs = parseRetryAfter(response.headers?.get?.('retry-after'));
        const snippet = await readResponseSnippet(response, webhook.provider === 'telegram' ? 16384 : 2048);
        // Providers can echo credentials in their error messages. Never persist them.
        if (!webhook.provider || webhook.provider === 'webhook') responseBody = snippet;
        if (webhook.provider === 'telegram') {
          let data;
          try { data = JSON.parse(snippet); } catch { throw new Error('Invalid provider response'); }
          if (!data.ok) {
            responseStatus = Number(data.error_code) || responseStatus;
            retryAfterMs = Math.max(retryAfterMs, parseRetryAfter(String(data.parameters?.retry_after || 0)));
            throw new Error(`Provider HTTP ${responseStatus}`);
          }
        }
        if (!response.ok) throw new Error(`HTTP ${responseStatus}`);
      } finally {
        await closeWebhookDispatcher(prepared.dispatcher);
      }
    } catch (error) { failure = error; }
    const errorType = failure ? classifyError(responseStatus, failure) : null;
    const retryCount = (job.retryCount || 0) + (failure ? 1 : 0);
    const dead = failure && (errorType === ERROR_TYPES.PERMANENT || retryCount >= maxAttempts);
    const status = !failure ? 'done' : dead ? 'dead' : 'failed';
    const delay = Math.max(retryAfterMs, calculateBackoff(retryCount, baseBackoffMs, maxBackoffMs, errorType));
    const lastError = failure ? (webhook.provider && webhook.provider !== 'webhook'
      ? `Integration delivery failed (${responseStatus || errorType})`
      : (failure.message || 'Delivery failed').slice(0, 500)) : null;
    const durationMs = Date.now() - startedAt.getTime();
    const attempt = {
      at: startedAt, status: responseStatus, durationMs, error: lastError,
      requestBody: (!webhook.provider || webhook.provider === 'webhook') ? request?.body?.slice(0, 4096) : null,
      responseBody, timestamp: request?.headers?.['X-CTXHUB-TIMESTAMP'] || null
    };
    const saved = await outbox.updateOne(owned, {
      $set: { status, leaseToken: null, updatedAt: new Date(), lastError, errorType,
        lastHttpStatus: responseStatus, lastDurationMs: durationMs,
        nextRetryAt: status === 'failed' ? new Date(Date.now() + delay) : null },
      $inc: { retryCount: failure ? 1 : 0 },
      $push: { attempts: { $each: [attempt], $slice: -20 } }
    });
    if (!saved.modifiedCount) { result.skipped++; continue; }
    result[!failure ? 'succeeded' : dead ? 'dead' : 'failed']++;
    try {
      const threshold = Number(process.env.WEBHOOK_DISABLE_AFTER_FAILURES) || 10;
      await dispatcherDeps.recordWebhookHealth(webhooks, webhook, !failure, Math.max(1, threshold));
    } catch { console.error('[webhookDispatcher] Health update failed', { webhookId: String(webhook._id) }); }
  }
  return result;
}

/**
 * Retry zamanı gelmiş başarısız webhook işlerini yeniden kuyruğa al
 */
async function retryFailedWebhookJobs(options = {}) {
  const tenantId = options.tenantId || null;
  const maxAttempts = resolveMaxAttempts(options.maxAttempts);
  const { outbox } = resolveCollections();

  const now = new Date();
  const query = {
    status: 'failed',
    retryCount: { $lt: maxAttempts },
    // nextRetryAt zamanı gelmiş olanlar veya nextRetryAt olmayan eski kayıtlar
    $or: [
      { nextRetryAt: { $lte: now } },
      { nextRetryAt: null }
    ]
  };

  if (tenantId) {
    query.tenantId = tenantId;
  }

  const result = await outbox.updateMany(query, {
    $set: {
      status: 'pending',
      updatedAt: new Date()
    }
  });

  return {
    matched: result.matchedCount || result.matched || 0,
    retried: result.modifiedCount || result.modified || 0
  };
}

/**
 * Dead (ölü) webhook işlerini temizle
 */
async function purgeDeadWebhookJobs(options = {}) {
  const tenantId = options.tenantId || null;
  const cleanupMs = resolveCleanupThresholdMs(options.olderThanMs);
  const { outbox } = resolveCollections();

  const query = {
    status: 'dead'
  };

  if (tenantId) {
    query.tenantId = tenantId;
  }

  if (cleanupMs > 0) {
    query.updatedAt = { $lte: new Date(Date.now() - cleanupMs) };
  }

  const result = await outbox.deleteMany(query);

  return {
    deleted: result.deletedCount || 0
  };
}

/**
 * Eski failed işleri temizle (backward compatibility için)
 * @deprecated Use purgeDeadWebhookJobs instead
 */
async function purgeIrrecoverableWebhookJobs(options = {}) {
  const tenantId = options.tenantId || null;
  const maxAttempts = resolveMaxAttempts(options.maxAttempts);
  const cleanupMs = resolveCleanupThresholdMs(options.olderThanMs);
  const { outbox } = resolveCollections();

  // Hem eski failed hem de dead işleri temizle
  const query = {
    $or: [
      { status: 'dead' },
      { status: 'failed', retryCount: { $gte: maxAttempts } }
    ]
  };

  if (tenantId) {
    query.tenantId = tenantId;
  }

  if (cleanupMs > 0) {
    query.updatedAt = { $lte: new Date(Date.now() - cleanupMs) };
  }

  const result = await outbox.deleteMany(query);

  return {
    deleted: result.deletedCount || 0
  };
}

/**
 * Belirli bir webhook için tüm failed/dead işleri sil (bulk delete)
 */
async function deleteJobsByWebhookId(tenantId, webhookId, options = {}) {
  const { outbox } = resolveCollections();
  const statuses = options.statuses || ['failed', 'dead'];

  const query = {
    tenantId,
    webhookId: new mongoose.Types.ObjectId(webhookId),
    status: { $in: statuses }
  };

  const result = await outbox.deleteMany(query);
  return { deleted: result.deletedCount || 0 };
}

/**
 * Belirli bir webhook için failed işleri yeniden kuyruğa al (bulk retry)
 */
async function retryJobsByWebhookId(tenantId, webhookId) {
  const { outbox } = resolveCollections();

  const query = {
    tenantId,
    webhookId: new mongoose.Types.ObjectId(webhookId),
    status: { $in: ['failed', 'dead'] }
  };

  const result = await outbox.updateMany(query, {
    $set: {
      status: 'pending',
      updatedAt: new Date(),
      nextRetryAt: null,
      retryCount: 0, // Retry count'u sıfırla
      lastError: null
    }
  });

  return {
    matched: result.matchedCount || 0,
    retried: result.modifiedCount || 0
  };
}

/**
 * Tüm failed/dead işleri yeniden kuyruğa al (tenant bazlı bulk retry)
 */
async function retryAllFailedJobs(tenantId, webhookIds) {
  const { outbox } = resolveCollections();

  const query = {
    tenantId,
    ...(webhookIds ? { webhookId: { $in: webhookIds } } : {}),
    status: { $in: ['failed', 'dead'] }
  };

  const result = await outbox.updateMany(query, {
    $set: {
      status: 'pending',
      updatedAt: new Date(),
      nextRetryAt: null,
      retryCount: 0,
      lastError: null
    }
  });

  return {
    matched: result.matchedCount || 0,
    retried: result.modifiedCount || 0
  };
}

/**
 * Tüm failed/dead işleri sil (tenant bazlı bulk delete)
 */
async function deleteAllFailedJobs(tenantId, webhookIds) {
  const { outbox } = resolveCollections();

  const query = {
    tenantId,
    ...(webhookIds ? { webhookId: { $in: webhookIds } } : {}),
    status: { $in: ['failed', 'dead'] }
  };

  const result = await outbox.deleteMany(query);
  return { deleted: result.deletedCount || 0 };
}

module.exports = {
  // Constants
  DEFAULT_BATCH_LIMIT,
  DEFAULT_MAX_RETRY_ATTEMPTS,
  DEFAULT_BASE_BACKOFF_MS,
  DEFAULT_MAX_BACKOFF_MS,
  DEFAULT_FAILED_CLEANUP_MS,
  ERROR_TYPES,

  // Core functions
  dispatchWebhookOutboxBatch,
  retryFailedWebhookJobs,
  purgeDeadWebhookJobs,
  purgeIrrecoverableWebhookJobs, // backward compatibility
  signPayload,

  // Bulk operations
  deleteJobsByWebhookId,
  retryJobsByWebhookId,
  retryAllFailedJobs,
  deleteAllFailedJobs,

  // Utility functions (exported for testing)
  classifyError,
  calculateBackoff,
  calculateNextRetryAt,
  parseRetryAfter,
  __setDispatcherDeps(overrides = {}) {
    Object.assign(dispatcherDeps, { fetch, prepareSafeWebhookRequest, notifyDisabledWebhooks, recordWebhookHealth, canDeliverWebhook }, overrides);
  }
};
