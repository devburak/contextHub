# Webhooks and invalidation

ContextHub Cloud webhooks notify your backend when tenant content changes. Use them to refresh caches, search indexes, feeds, and other derived data.

## Receiver sequence

1. Read the raw request body.
2. Verify the signature with the webhook secret using a timing-safe comparison.
3. Reject stale timestamps outside your replay window.
4. Deduplicate the event ID in durable storage.
5. Durably enqueue work.
6. Return success quickly and process invalidation asynchronously.

## Idempotency and retries

Delivery is at-least-once. Processing the same event twice must be safe. Return `2xx` only after durable acceptance, `4xx` for permanently invalid requests, and `5xx` for temporary failures. Use bounded exponential backoff and a dead-letter queue.

## Cache invalidation

- Publish/update: invalidate ID, slug, relevant listings, search, and dependent pages.
- Unpublish/delete: also remove stale slug and derived search entries.
- Slug change: invalidate both previous and current slugs.
- Collection update: invalidate the entry, collection listing, and dependent views.
- Menu/placement update: invalidate the stable resource key.

Webhook secrets belong in a secret manager. Rotate them, redact them from logs, and never expose signature debugging information to an unauthenticated caller.

The webhook management UI and delivery operations are part of the managed ContextHub Cloud administration experience.

## Notification channels

All channels are available on Free and paid plans without a feature entitlement. Customers connect their own accounts; tenant administration permission is still required.

Create a subscription in **Assets → Webhooks**, choose a channel and select events. Slack, Telegram and WhatsApp deliveries use the same durable outbox, retries and history as HTTP webhooks. Notifications contain event type, tenant ID, event ID and time, rather than form answers or full content.

- [Slack connection guide](./slack-notifications.md): authorize your own workspace and select a channel without entering a webhook URL.
- [Telegram connection guide](./telegram-notifications.md): create your own bot, obtain a chat ID and connect it.
- [WhatsApp connection guide](./whatsapp-notifications.md): prepare your Business account and approved three-parameter template.
- [Provider setup for operators](./notification-provider-setup.md): Slack app/OAuth settings, credential encryption, existing SMTP and Graph API version.

## Subscription filters and payload

Event types, locale, environment and collection keys combine with AND. Multiple values inside a filter combine with OR. Empty filters match everything. Locale matches `payload.locale` or `payload.response.locale`; events without a locale do not match a nonempty locale filter. Environment comes from `APP_ENV`, falling back to `NODE_ENV` or `development` when the event is created. Old events without this metadata do not match an environment filter. Collection keys match collection events. Content does not currently have a separate persisted content-type discriminator; use event types and collection keys.

HTTP webhooks support **event** (the existing event snapshot) and **ids** (event identity and resource identifiers only) body modes. Event mode does not promise a full content document: content events already contain identifiers/status/version; form submission events can include submitted answers. Use IDs mode and retrieve the resource through the tenant API when appropriate. Integration messages always use a short event summary.

## Timestamp signature

Legacy `X-CTXHUB-SIGNATURE` remains HMAC-SHA256 over the exact raw body for compatibility. Migrate receivers to:

- `X-CTXHUB-TIMESTAMP`: Unix seconds, refreshed on every attempt.
- `X-CTXHUB-SIGNATURE-V2`: `v1=<hex HMAC-SHA256(secret, timestamp + "." + rawBody)>`.
- `X-CTXHUB-EVENT`: event type.
- `X-CTXHUB-DELIVERY-ID`: stable event ID plus subscription ID.

Reject timestamps more than 300 seconds from your clock. Compare the decoded 32-byte signature with `crypto.timingSafeEqual`; reject missing/malformed headers and never fall back to the legacy signature after a V2 failure. Persist a unique event/subscription receipt before processing; timestamps alone do not prevent replay inside the allowed window. Retries and manual resend retain event identity, so receiver-side processing must be idempotent. Returning `2xx` means acceptance, not merely receipt before a crash.

## Delivery operations

The worker checks every five seconds by default and requeues retries when due. HTTP 408, 429, 5xx and network failures retry with exponential backoff and jitter; other 4xx responses become dead immediately. `Retry-After` and Telegram `retry_after` delay the next attempt (capped at 24 hours). Defaults are 5 attempts, a 60-second base delay and a one-hour exponential backoff ceiling. A delivery has a 15-second total HTTP deadline including response reading; DNS resolution is capped at five seconds. Responses are streamed into bounded previews and redirects are rejected. Production requires HTTPS and rejects private/reserved IPs, mixed public/private DNS answers, local names and IPv6 translation/tunnel ranges. Connections pin the checked DNS result.

After `WEBHOOK_DISABLE_AFTER_FAILURES` consecutive failed attempts (default 10 across deliveries), the subscription stops automatically. An owner email is queued persistently and retried independently if SMTP fails. Reactivate by editing the subscription; review and resend dead jobs afterwards. Skipped inactive/deleted subscriptions become dead deliveries rather than successes. Processing jobs abandoned for two minutes are reclaimed with a fresh lease. Recovery can still redeliver a request accepted before a worker crash: delivery is at-least-once.

The admin history includes successful, failed and dead deliveries, status codes, duration, next retry and the last 20 attempts. HTTP request previews are capped at 4096 characters and responses at 2048 bytes; provider request/response bodies and credentials are omitted. Individual resend accepts completed/failed/dead jobs only and requires an active subscription. Existing bulk failed-job operations remain available. Dead jobs are cleaned after the configured retention period (default seven days by cron); all outbox documents have an existing 180-day TTL.

New jobs have a unique deduplication key and event fan-out uses idempotent upserts. The required partial unique index is verified at API startup without deleting historic duplicate rows; historic rows are not retroactively deduplicated. Run normal API startup/index initialization before standalone dispatch scripts after upgrading.

Operational APIs (tenant authorization is enforced on every route):

- `POST /admin/tenants/:tenantId/webhooks/slack/connect` and `/slack/complete`
- `GET /admin/tenants/:tenantId/webhooks/deliveries?limit=30&webhookId=<optional-id>`
- `POST /admin/tenants/:tenantId/webhooks/deliveries/:deliveryId/replay`

The API starts the worker automatically; set `WEBHOOK_SCHEDULER_ENABLED=false` only when using an external worker. Keep the API worker running, or run the existing webhook cron regularly if in-process schedulers are disabled. Configure working tenant or global SMTP for owner alerts. Provider setup and a real end-to-end test are required before enabling customer notifications in production.

## Team and personal destinations

When connecting a chat provider, choose **Team channel** or **Personal connection**. Both require the current tenant's management permission. Team connections can be managed by authorized tenant administrators; personal connections and their delivery history are visible only to their creator. Visibility is fixed when the connection is created; create a new connection to change it. Existing subscriptions remain team connections.

A personal connection receives the selected events from its tenant; it does not mean only events triggered by that user. The worker checks the owner's active account, active tenant membership and current management permission before every send, including retries and resends. Revoked access stops delivery. Personal connection failure emails go only to its owner.

Delivery uses the saved destination: the channel selected during Slack authorization, the Telegram bot's configured chat ID, or the configured WhatsApp recipient number. No tenant-wide or platform-wide fallback recipient is used. A personal connection does not make an external group private: Slack/Telegram group administrators control membership. Choose a private channel or a direct chat and verify its members before enabling notifications. Telegram chat IDs must identify the intended chat; permission to post with a bot token alone does not prove ownership of that chat. WhatsApp recipients must agree to receive notifications.

Tenant events, subscriptions and outbox payloads must have matching stable tenant IDs. Missing or mismatched IDs are blocked before any external request. Tenant slugs do not expand delivery scope. Self-hosted operators with legacy slug-based subscriptions must migrate them to stable tenant IDs before enabling delivery; encrypted provider credentials require re-encryption with the new tenant ID. Do not interpret a 24-character hexadecimal identifier as a slug.
