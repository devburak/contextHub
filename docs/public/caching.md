# Caching and freshness

Cache published reads in layers. Keep the policy short, observable, and easy to invalidate.

## Recommended hierarchy

1. **Request/render cache:** deduplicate identical reads during one server render or request.
2. **Application cache:** keep published GET responses for roughly 30–60 seconds as a conservative starting point.
3. **Edge cache:** cache tenant-scoped public GET routes at Cloudflare when the response is explicitly safe to share.
4. **Webhook invalidation:** purge or revalidate affected keys after a verified content event.

The exact TTL depends on editorial freshness and traffic. Start short, measure origin load and stale reads, then tune by resource family.

## Cache key design

Include every value that changes the representation:

```text
tenant + route + normalized path + normalized query + locale + representation version
```

Do not rely on host or path alone when multiple tenants can reach the same gateway. Normalize query ordering and reject unknown cache-varying inputs.

## Never cache

- `POST`, `PUT`, `PATCH`, or `DELETE` requests.
- Admin sessions, login, logout, or CSRF responses.
- Preview, draft, or permission-sensitive content.
- Responses containing `Set-Cookie`.
- Errors unless the product has an explicit, short negative-cache policy.
- Personalized responses in a shared cache.

## Stale-while-revalidate

For non-critical public content, a short stale window can hide transient origin latency. Serve stale data only when the product can tolerate it, keep a strict maximum age, and expose cache status in diagnostics.

```http
Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=120
Vary: Accept-Encoding
```

This header is an example, not a universal default. Ensure the edge cache key already includes tenant and representation inputs; `Vary` alone does not establish tenant isolation.

## Invalidation map

Maintain a small mapping from event type to cache namespace:

| Event | Suggested invalidation |
| --- | --- |
| Content published or updated | Content ID, slug, related listing keys |
| Content unpublished or deleted | Content ID, slug, listing and search keys |
| Collection entry changed | Entry, collection list, dependent pages |
| Menu changed | Menu key and pages that embed it |
| Placement changed | Placement key and eligibility response |

If precise dependency tracking is unavailable, purge a bounded tenant namespace instead of the entire global cache.

## Observability

Record `HIT`, `MISS`, `STALE`, and `BYPASS` outcomes, the tenant-safe cache namespace, age, and origin duration. Never include an API token or unredacted user data in cache metadata.

Continue with [Webhooks and invalidation](./webhooks.md) for delivery verification and retry handling.
