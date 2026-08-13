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
