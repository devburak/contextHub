const crypto = require('node:crypto');
const { fetch } = require('undici');
const { mongoose } = require('@contexthub/common');

const DEFAULT_BATCH_LIMIT = 50;
const MAX_LOG_BODY_LENGTH = 500;
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
  // Timeout hatası
  if (error?.name === 'TimeoutError' || error?.code === 'UND_ERR_CONNECT_TIMEOUT' || error?.message?.includes('timeout')) {
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

  return Math.floor(cappedDelay + jitter);
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

async function readResponseSnippet(response) {
  if (!response || typeof response.text !== 'function') {
    return null;
  }
  try {
    const text = await response.text();
    if (!text) return null;
    if (text.length <= MAX_LOG_BODY_LENGTH) {
      return text;
    }
    return `${text.slice(0, MAX_LOG_BODY_LENGTH)}…`;
  } catch (error) {
    return null;
  }
}

async function dispatchWebhookOutboxBatch(options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : DEFAULT_BATCH_LIMIT;
  const tenantId = options.tenantId || null;
  const maxAttempts = resolveMaxAttempts(options.maxAttempts);
  const baseBackoffMs = resolveBaseBackoffMs(options.baseBackoffMs);
  const maxBackoffMs = resolveMaxBackoffMs(options.maxBackoffMs);
  const { outbox, webhooks } = resolveCollections();

  const query = { status: 'pending' };
  if (tenantId) {
    query.tenantId = tenantId;
  }

  const jobs = await outbox
    .find(query)
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  if (!jobs.length) {
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0, dead: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let dead = 0;

  for (const job of jobs) {
    const lock = await outbox.updateOne(
      { _id: job._id, status: 'pending' },
      { $set: { status: 'processing', updatedAt: new Date(), lastError: null } }
    );

    if (!lock.matchedCount || !lock.modifiedCount) {
      skipped += 1;
      continue;
    }

    const webhook = await webhooks.findOne({ _id: job.webhookId, tenantId: job.tenantId, isActive: true });
    if (!webhook) {
      skipped += 1;
      await outbox.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'done',
            updatedAt: new Date(),
            lastError: 'Webhook not found or inactive'
          }
        }
      );
      continue;
    }

    const body = JSON.stringify(job.payload || {});
    const signature = signPayload(webhook.secret, body);

    const context = {
      tenantId: job.tenantId,
      webhookId: job.webhookId?.toString?.() || job.webhookId,
      eventId: job.eventId
    };

    let responseStatus = null;
    let responseBodySnippet = null;
    let durationMs = null;

    try {
      const startTime = typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CTXHUB-SIGNATURE': signature,
          'X-CTXHUB-EVENT': job.type
        },
        body,
        signal: resolveAbortSignal(options.timeoutMs || 15000)
      });

      responseStatus = response.status;
      const endTime = typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
      durationMs = Math.round(endTime - startTime);

      responseBodySnippet = await readResponseSnippet(response);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      succeeded += 1;
      console.info('[webhookDispatcher] Webhook delivered', {
        ...context,
        status: responseStatus,
        durationMs,
        responseBody: responseBodySnippet
      });
      await outbox.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'done',
            updatedAt: new Date(),
            lastError: null,
            errorType: null,
            lastHttpStatus: responseStatus,
            lastDurationMs: durationMs,
            nextRetryAt: null
          }
        }
      );
    } catch (error) {
      const nextRetryCount = (job.retryCount || 0) + 1;
      const errorType = classifyError(responseStatus, error);

      // Kalıcı hata ise direkt dead olarak işaretle
      if (errorType === ERROR_TYPES.PERMANENT) {
        dead += 1;
        const failureMessage = `Kalıcı hata (${responseStatus || 'unknown'}): ${error?.message || 'Unknown error'}. Retry yapılmayacak.`;
        console.error('[webhookDispatcher] Webhook delivery permanently failed', {
          ...context,
          status: responseStatus,
          responseBody: responseBodySnippet,
          error: error?.message || error,
          errorType,
          retryCount: nextRetryCount
        });
        await outbox.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'dead',
              updatedAt: new Date(),
              lastError: failureMessage,
              errorType,
              lastHttpStatus: responseStatus,
              lastDurationMs: durationMs,
              nextRetryAt: null
            },
            $inc: { retryCount: 1 }
          }
        );
        continue;
      }

      // Geçici hata - retry limit kontrolü
      const reachedMax = nextRetryCount >= maxAttempts;

      if (reachedMax) {
        dead += 1;
        const failureMessage = `Max retry aşıldı (${maxAttempts}). Son hata: ${error?.message || 'Unknown error'}`;
        console.error('[webhookDispatcher] Webhook delivery failed - max retries reached', {
          ...context,
          status: responseStatus,
          responseBody: responseBodySnippet,
          error: error?.message || error,
          errorType,
          retryCount: nextRetryCount,
          maxAttempts
        });
        await outbox.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'dead',
              updatedAt: new Date(),
              lastError: failureMessage,
              errorType,
              lastHttpStatus: responseStatus,
              lastDurationMs: durationMs,
              nextRetryAt: null
            },
            $inc: { retryCount: 1 }
          }
        );
      } else {
        failed += 1;
        const nextRetryAt = calculateNextRetryAt(nextRetryCount, errorType, baseBackoffMs, maxBackoffMs);
        const failureMessage = error?.message || 'Unknown error';

        console.error('[webhookDispatcher] Webhook delivery failed - will retry', {
          ...context,
          status: responseStatus,
          responseBody: responseBodySnippet,
          error: error?.message || error,
          errorType,
          retryCount: nextRetryCount,
          maxAttempts,
          nextRetryAt: nextRetryAt.toISOString()
        });

        await outbox.updateOne(
          { _id: job._id },
          {
            $set: {
              status: 'failed',
              updatedAt: new Date(),
              lastError: failureMessage,
              errorType,
              lastHttpStatus: responseStatus,
              lastDurationMs: durationMs,
              nextRetryAt
            },
            $inc: { retryCount: 1 }
          }
        );
      }
    }
  }

  return {
    processed: jobs.length,
    succeeded,
    failed,
    skipped,
    dead
  };
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
async function retryAllFailedJobs(tenantId) {
  const { outbox } = resolveCollections();

  const query = {
    tenantId,
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
async function deleteAllFailedJobs(tenantId) {
  const { outbox } = resolveCollections();

  const query = {
    tenantId,
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
  calculateNextRetryAt
};
