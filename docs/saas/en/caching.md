# Caching and freshness

Cache safe ContextHub Cloud reads in layers. The goal is to reduce latency and API traffic without crossing tenants or serving drafts.

## Recommended order

```text
request/render deduplication -> 30–60s application cache -> ContextHub Edge Gateway
```

Use Redis or another shared cache when multiple application instances must share results. Keep the TTL as a fallback and use verified webhooks for fast invalidation.

## Cache key

Include every representation input:

```text
tenant + method + normalized path + normalized query + locale + representation version
```

An API token must not become part of a loggable cache key. Derive a stable tenant namespace after authentication.

## Safe candidates

- Published content list and slug detail reads.
- Public collection lists, detail records, and bounded DSL queries.
- Menus and public form definitions.
- Public tenant branding and non-personalized placement definitions.

## Never cache

- Mutations and form submissions.
- Admin sessions, authentication, or CSRF responses.
- Preview, draft, scheduled, or permission-sensitive content.
- Responses containing `Set-Cookie`.
- Personalized placement decisions in a shared cache.
- Unbounded errors or rate-limit responses.

## Invalidation

Invalidate content ID, old/new slug, listing, search, menu, collection, and placement keys affected by a verified webhook. If exact dependency tracking is unavailable, purge a bounded tenant namespace rather than the global cache.

Record `HIT`, `MISS`, `STALE`, and `BYPASS`, plus age and origin duration. Redact tokens and customer content from cache diagnostics.

Continue with [Webhooks and invalidation](./webhooks.md).
