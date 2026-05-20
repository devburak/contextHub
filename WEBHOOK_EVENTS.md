# Webhook & Domain Event Primer

ContextHub is a multi-tenant platform. Every domain event is scoped by a `tenantId` so downstream processors can isolate state, security, and quotas per tenant. This initial design documents the common event contract before any endpoint or worker starts emitting or consuming events.

## Domain Event Shape

A domain event is an immutable plain JavaScript object describing something that already happened inside the platform. Producers create it once, append it to storage, and never mutate it afterwards.

```json
{
  "id": "uuid",
  "tenantId": "keskorgtr",
  "type": "content.published",
  "occurredAt": "2025-11-15T10:00:00.000Z",
  "payload": {
    "...": "..."
  },
  "metadata": {
    "triggeredBy": "user",
    "userId": "user_123",
    "source": "admin-ui"
  }
}
```

| Field | Description |
| --- | --- |
| `id` | Globally unique identifier (UUID v4 recommended). |
| `tenantId` | Required tenant slug/id to keep multi-tenant boundaries intact. |
| `type` | String label describing the event (see list below). |
| `occurredAt` | ISO-8601 timestamp captured when the action finished. |
| `payload` | Arbitrary JSON payload with the domain-specific data snapshot. |
| `metadata` | Optional context (who/what triggered it, which channel, etc.). |

## Supported Event Types (Phase 1)

- `content.created`
- `content.updated`
- `content.published`
- `content.unpublished`
- `content.deleted`
- `form.created`
- `form.updated`
- `form.submitted`
- `placement.created`
- `placement.updated`
- `placement.deleted`
- `menu.created`
- `menu.updated`
- `menu.deleted`
- `tenantSettings.updated`
- `media.updated`
- `collection.created`
- `collection.updated`
- `collection.entry.created`
- `collection.entry.updated`
- `collection.entry.deleted`

The `payload` structure is intentionally open so each feature team can include the minimum snapshot they need for replay (e.g., content ID, slug, version, diff, etc.).

## Placement Event Payload

Placement create, update, archive, duplicate, experience changes, and delete actions emit `placement.created`, `placement.updated`, or `placement.deleted`. The payload includes enough data for app-side popup/custom-view caches to refresh without calling admin endpoints.

```json
{
  "placementId": "placement_id",
  "slug": "welcome-popup",
  "name": "Welcome popup",
  "category": "popup",
  "status": "active",
  "defaultRules": {},
  "settings": {},
  "experiences": [
    {
      "experienceId": "experience_id",
      "name": "Default",
      "status": "active",
      "contentType": "form",
      "payload": { "formId": "form_id" },
      "ui": {},
      "trigger": { "type": "onLoad" },
      "rules": {},
      "conversions": {}
    }
  ],
  "endpoints": {
    "details": "/api/public/placements/welcome-popup",
    "decide": "/api/public/placements/decide",
    "event": "/api/public/placements/event"
  }
}
```

Consumers that render custom UI should refresh their local placement definition from `endpoints.details` and continue using the decision endpoint for targeting, frequency, and A/B selection.

## Admin Visibility

Admin users can inspect webhook/cache health for placement changes from the Placement Workbench. The UI reads:

```http
GET /api/admin/tenants/:tenantId/webhooks/queue
```

The response is shown as:
- Pending domain events.
- Pending webhook outbox deliveries.
- Failed webhook deliveries with retry/error metadata.

This view exists to answer "I changed the placement, why did the app not update?" without requiring direct database or worker-log access.

## Storage Strategy (Phase 1)

For the first milestone the API simply persists every event into a `DomainEvents` MongoDB collection. No outbound calls or queueing happens yet. That keeps the contract discoverable while infrastructure is still being prepared.

Future phases will introduce specialized workers/agents that read from the same collection (or a dedicated outbox) to perform:

- **Webhook outbox:** Deliver webhooks per tenant or integration partner with retries/backoff.
- **Snapshot projection:** Build read-optimized aggregates or cache layers from the event log.
- **Index/queue fan-out:** Feed search indexes or analytics pipelines asynchronously.

Keeping the schema immutable today allows those consumers to iterate independently later without changing how producers issue events.
