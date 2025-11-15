const { processDomainEventsBatch } = require('./domainEventsBatch');
const { dispatchWebhookOutboxBatch, retryFailedWebhookJobs } = require('./webhookDispatcher');

const deps = {
  processDomainEventsBatch,
  dispatchWebhookOutboxBatch,
  retryFailedWebhookJobs
};

function normalizeTenantId(tenantId) {
  if (!tenantId) {
    return null;
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
  return null;
}

function schedule(fn) {
  if (typeof queueMicrotask === 'function') {
    return queueMicrotask(fn);
  }
  return Promise.resolve().then(fn);
}

async function runTenantWebhookPipeline(options = {}) {
  const normalizedTenantId = normalizeTenantId(options.tenantId);
  if (!normalizedTenantId) {
    throw new Error('[webhookTrigger] tenantId is required');
  }

  const eventsResult = await deps.processDomainEventsBatch({ tenantId: normalizedTenantId, limit: options.domainEventLimit });
  const retryResult = await deps.retryFailedWebhookJobs({
    tenantId: normalizedTenantId,
    maxAttempts: options.maxRetryAttempts,
    backoffMs: options.retryBackoffMs
  });
  const dispatchResult = await deps.dispatchWebhookOutboxBatch({
    tenantId: normalizedTenantId,
    limit: options.webhookLimit,
    maxAttempts: options.maxRetryAttempts
  });

  return {
    eventsResult,
    retryResult,
    dispatchResult
  };
}

function triggerWebhooksForTenant(tenantId, options = {}) {
  const normalizedTenantId = normalizeTenantId(tenantId);
  if (!normalizedTenantId) {
    return;
  }

  schedule(async () => {
    try {
      await runTenantWebhookPipeline({
        tenantId: normalizedTenantId,
        domainEventLimit: options.domainEventLimit,
        webhookLimit: options.webhookLimit,
        maxRetryAttempts: options.maxRetryAttempts,
        retryBackoffMs: options.retryBackoffMs
      });
    } catch (error) {
      console.error('[webhookTrigger] Failed to process tenant webhooks', {
        tenantId: normalizedTenantId,
        error
      });
    }
  });
}

function __setWebhookTriggerDeps(overrides = null) {
  deps.processDomainEventsBatch = overrides?.processDomainEventsBatch || processDomainEventsBatch;
  deps.dispatchWebhookOutboxBatch = overrides?.dispatchWebhookOutboxBatch || dispatchWebhookOutboxBatch;
  deps.retryFailedWebhookJobs = overrides?.retryFailedWebhookJobs || retryFailedWebhookJobs;
}

module.exports = {
  __setWebhookTriggerDeps,
  normalizeTenantId,
  runTenantWebhookPipeline,
  triggerWebhooksForTenant
};
