const crypto = require('node:crypto');
const { fetch } = require('undici');
const { mongoose } = require('@contexthub/common');

const DEFAULT_BATCH_LIMIT = 50;
const MAX_LOG_BODY_LENGTH = 500;
const DEFAULT_MAX_RETRY_ATTEMPTS = Number.isFinite(Number(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS))
  ? Number(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS)
  : 5;
const DEFAULT_RETRY_BACKOFF_MS = Number.isFinite(Number(process.env.WEBHOOK_RETRY_BACKOFF_MS))
  ? Number(process.env.WEBHOOK_RETRY_BACKOFF_MS)
  : 60_000;
const DEFAULT_FAILED_CLEANUP_MS = Number.isFinite(Number(process.env.WEBHOOK_FAILED_CLEANUP_MS))
  ? Number(process.env.WEBHOOK_FAILED_CLEANUP_MS)
  : 7 * 24 * 60 * 60 * 1000;

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

function resolveBackoffMs(value) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return DEFAULT_RETRY_BACKOFF_MS;
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
    return { processed: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

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
      durationMs = endTime - startTime;

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
            lastError: null
          }
        }
      );
    } catch (error) {
      failed += 1;
      const nextRetryCount = (job.retryCount || 0) + 1;
      const reachedMax = nextRetryCount >= maxAttempts;
      const failureMessage = reachedMax
        ? `Max retry attempts reached (${maxAttempts}). Last error: ${error?.message || 'Unknown error'}`
        : (error?.message || 'Unknown error');
      console.error('[webhookDispatcher] Webhook delivery failed', {
        ...context,
        status: responseStatus,
        responseBody: responseBodySnippet,
        error: error?.message || error,
        retryCount: nextRetryCount,
        maxAttempts
      });
      await outbox.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'failed',
            updatedAt: new Date(),
            lastError: failureMessage
          },
          $inc: { retryCount: 1 }
        }
      );
    }
  }

  return {
    processed: jobs.length,
    succeeded,
    failed,
    skipped
  };
}

async function retryFailedWebhookJobs(options = {}) {
  const tenantId = options.tenantId || null;
  const maxAttempts = resolveMaxAttempts(options.maxAttempts);
  const backoffMs = resolveBackoffMs(options.backoffMs);
  const { outbox } = resolveCollections();

  const query = {
    status: 'failed',
    retryCount: { $lt: maxAttempts }
  };

  if (tenantId) {
    query.tenantId = tenantId;
  }

  if (backoffMs > 0) {
    query.updatedAt = { $lte: new Date(Date.now() - backoffMs) };
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

async function purgeIrrecoverableWebhookJobs(options = {}) {
  const tenantId = options.tenantId || null;
  const maxAttempts = resolveMaxAttempts(options.maxAttempts);
  const cleanupMs = resolveCleanupThresholdMs(options.olderThanMs);
  const { outbox } = resolveCollections();

  const query = {
    status: 'failed',
    retryCount: { $gte: maxAttempts }
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

module.exports = {
  DEFAULT_BATCH_LIMIT,
  DEFAULT_MAX_RETRY_ATTEMPTS,
  DEFAULT_RETRY_BACKOFF_MS,
  DEFAULT_FAILED_CLEANUP_MS,
  dispatchWebhookOutboxBatch,
  retryFailedWebhookJobs,
  purgeIrrecoverableWebhookJobs,
  signPayload
};
