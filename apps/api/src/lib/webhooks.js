/**
 * @typedef {import('@contexthub/common/src/domainEvents').DomainEvent} DomainEvent
 * @typedef {import('@contexthub/common/src/models/Webhook')} Webhook
 * @typedef {import('@contexthub/common/src/models/WebhookOutbox')} WebhookOutboxJob
 */

/**
 * Determine whether a webhook should receive the provided domain event.
 * @param {Webhook} hook
 * @param {DomainEvent} event
 * @returns {boolean}
 */
function isWebhookSubscribed(hook, event) {
  if (!hook || !hook.isActive) {
    return false;
  }

  if (!Array.isArray(hook.events) || hook.events.length === 0) {
    return false;
  }

  if (hook.events.includes('*')) {
    return true;
  }

  return hook.events.includes(event.type);
}

function cloneEventPayload(event) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(event);
  }
  return JSON.parse(JSON.stringify(event));
}

/**
 * Build webhook outbox jobs for a given event.
 *
 * @param {DomainEvent} event
 * @param {Webhook[]} webhooks
 * @returns {Array<Omit<WebhookOutboxJob, '_id'>>}
 */
function buildWebhookOutboxJobs(event, webhooks = []) {
  if (!event || !Array.isArray(webhooks) || webhooks.length === 0) {
    return [];
  }

  const now = new Date();

  return webhooks
    .filter((hook) => isWebhookSubscribed(hook, event))
    .map((hook) => ({
      tenantId: event.tenantId,
      webhookId: hook._id,
      eventId: event.id,
      type: event.type,
      payload: cloneEventPayload(event),
      status: 'pending',
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: null
    }));
}

module.exports = {
  buildWebhookOutboxJobs,
  isWebhookSubscribed
};
