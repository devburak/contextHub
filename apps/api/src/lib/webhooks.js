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

  if (!hook.events.includes('*') && !hook.events.includes(event.type)) return false;
  const filters = hook.filters || {};
  const payload = event.payload || {};
  const values = {
    locales: payload.locale || payload.response?.locale,
    environments: event.metadata?.environment,
    collectionKeys: payload.collectionKey || (event.type.startsWith('collection.') ? payload.key : null)
  };
  return Object.entries(values).every(([key, value]) => !filters[key]?.length || filters[key].includes(value));
}

function selectEventPayload(event, mode) {
  if (mode !== 'ids') return cloneEventPayload(event);
  const identifiers = Object.fromEntries(Object.entries(event.payload || {})
    .filter(([key]) => /^(?:id|.*Id|slug|key|collectionKey)$/.test(key)));
  if (event.payload?.response?.responseId) identifiers.responseId = event.payload.response.responseId;
  return { id: event.id, tenantId: event.tenantId, type: event.type, occurredAt: event.occurredAt, payload: identifiers };
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
      tenantId: hook.tenantId || event.tenantId,
      webhookId: hook._id,
      eventId: event.id,
      dedupeKey: `${hook.tenantId || event.tenantId}:${hook._id}:${event.id}`,
      type: event.type,
      payload: selectEventPayload(event, hook.payloadMode),
      status: 'pending',
      retryCount: 0,
      lastError: null,
      createdAt: now,
      updatedAt: null
    }));
}

module.exports = {
  buildWebhookOutboxJobs,
  selectEventPayload,
  isWebhookSubscribed
};
