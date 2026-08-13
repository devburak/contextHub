# Webhooks and invalidation

Webhooks let an application refresh caches and derived systems shortly after content changes. Treat every delivery as untrusted until its signature and freshness are verified.

## Receiver sequence

1. Read the raw request body without altering its bytes.
2. Verify the signature with the webhook secret using a timing-safe comparison.
3. Reject timestamps outside the accepted replay window.
4. Deduplicate the event ID in durable storage.
5. Return a success response quickly.
6. Process expensive invalidation or indexing work asynchronously.

## Idempotency

Delivery is at-least-once. A receiver must safely process the same event more than once. Store an event ID with an expiry or make the downstream mutation naturally idempotent.

```js
if (await eventStore.has(event.id)) {
  return new Response(null, { status: 204 })
}

await queue.send(event)
await eventStore.remember(event.id)
return new Response(null, { status: 202 })
```

In production, choose ordering so a crash cannot permanently lose work. A durable queue and transactional outbox-style record are safer than an in-memory set.

## Retry behavior

- Return `2xx` only after the delivery has been durably accepted.
- Use `4xx` for permanently invalid signatures or schemas.
- Use `5xx` for temporary receiver failures that should retry.
- Apply exponential backoff with jitter to downstream calls.
- Send poison events to a dead-letter queue after a bounded retry count.

## Cache invalidation

Use the verified tenant and event payload to invalidate only affected keys. Unpublish and delete events must purge old slug and listing keys as well as ID keys. If an event references a previous slug, invalidate both the previous and current forms.

## Secret handling

Webhook secrets belong in a secret manager. Rotate them with an overlap window when supported, redact them from logs, and never return signature debugging material to an unauthenticated caller.

See [Caching and freshness](./caching.md) for key design and [Cloudflare architecture](./cloud-architecture.md) for queue-based processing.
