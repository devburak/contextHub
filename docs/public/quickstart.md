# Quickstart

This example reads a published content item by slug. Replace the placeholders with your public API URL, tenant ID, and content slug.

## Request published content

```bash
curl --request GET \
  --url "https://api.example.com/api/public/contents/slug/welcome" \
  --header "X-Tenant-ID: tenant-key"
```

Public delivery calls do not use a ContextHub API token. The tenant header selects the public content namespace; publication checks remain server-side.

## Browser example

```js
const response = await fetch(
  'https://api.example.com/api/public/contents/slug/welcome',
  {
    headers: { 'X-Tenant-ID': 'tenant-key' },
  },
)

if (!response.ok) {
  throw new Error(`ContextHub request failed: ${response.status}`)
}

const content = await response.json()
```

Configure the browser origin in the tenant CORS allow-list. Do not work around CORS with a public proxy that injects a private API token.

## Server example

For authenticated server-to-server reads, send a scoped token and the tenant header. Store both values in the server's secret manager.

```js
const response = await fetch(`${process.env.CONTEXTHUB_API_URL}/api/contents`, {
  headers: {
    Authorization: `Bearer ${process.env.CONTEXTHUB_API_TOKEN}`,
    'X-Tenant-ID': process.env.CONTEXTHUB_TENANT_ID,
  },
})
```

## Production checklist

- Use public endpoints for browser delivery and authenticated endpoints for trusted services.
- Set request timeouts and handle non-2xx responses.
- Cache published GET responses briefly; do not cache mutations, previews, drafts, sessions, or responses containing `Set-Cookie`.
- Invalidate affected cache keys after a verified webhook.
- Log request IDs and status codes, but redact authorization values and sensitive payload fields.
- Keep a last-known-good response only where stale content is acceptable to the product.

## Continue

Read [Content delivery](./content-delivery.md) for endpoint families and [Caching and freshness](./caching.md) before adding production traffic.
