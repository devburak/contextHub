/**
 * Ordered list of supported domain event types. Keep this in sync with
 * documentation in WEBHOOK_EVENTS.md.
 * @type {ReadonlyArray<DomainEventType>}
 */
const DOMAIN_EVENT_TYPES = Object.freeze([
  'content.created',
  'content.updated',
  'content.published',
  'content.unpublished',
  'content.deleted',
  'form.created',
  'form.updated',
  'form.submitted',
  'placement.created',
  'placement.updated',
  'placement.deleted',
  'menu.created',
  'menu.updated',
  'menu.deleted',
  'tenantSettings.updated',
  'media.updated',
  'collection.created',
  'collection.updated',
  'collection.entry.created',
  'collection.entry.updated',
  'collection.entry.deleted'
]);

/**
 * Known event types emitted by the platform.
 * @typedef {'content.created' | 'content.updated' | 'content.published' | 'content.unpublished' | 'content.deleted' |
 * 'form.created' | 'form.updated' | 'form.submitted' | 'placement.created' | 'placement.updated' | 'placement.deleted' |
 * 'menu.created' | 'menu.updated' | 'menu.deleted' | 'tenantSettings.updated' | 'media.updated' |
 * 'collection.created' | 'collection.updated' |
 * 'collection.entry.created' | 'collection.entry.updated' | 'collection.entry.deleted'} DomainEventType
 */

/**
 * Optional metadata describing the trigger context of an event.
 * @typedef {Object} DomainEventMetadata
 * @property {'user' | 'system' | 'integration'} [triggeredBy]
 * @property {string} [userId]
 * @property {string} [source]
 * @property {string} [requestId]
 */

/**
 * Canonical domain event contract shared across services.
 * @typedef {Object} DomainEvent
 * @property {string} id - Unique identifier (UUID v4 preferred)
 * @property {string} tenantId - Tenant slug/id to enforce isolation
 * @property {DomainEventType} type - Event type name
 * @property {string} occurredAt - ISO string representing when the event finished
 * @property {Record<string, any>} payload - Immutable data snapshot payload
 * @property {DomainEventMetadata} [metadata] - Optional producer metadata
 */

module.exports = {
  DOMAIN_EVENT_TYPES
};
