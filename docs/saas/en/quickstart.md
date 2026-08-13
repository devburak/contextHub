# Quickstart

The production API base URL for ContextHub Cloud is:

```text
https://api.ctxhub.net/api
```

## Configure a server integration

Keep the API token in your server secret manager.

```env
CTX_API_BASE_URL=https://api.ctxhub.net/api
CTX_API_TOKEN=ctx_your_token
```

List published content from a trusted server:

```js
const response = await fetch(
  'https://api.ctxhub.net/api/contents?status=published&limit=10',
  {
    headers: {
      Authorization: `Bearer ${process.env.CTX_API_TOKEN}`,
    },
  },
)

if (!response.ok) throw new Error(`ContextHub returned ${response.status}`)
const result = await response.json()
```

The API token establishes the tenant, role, and scopes. Do not send a different tenant in the body.

## Make a public browser request

Public collection delivery does not use a private token. Configure your browser origin in the tenant settings, then send the tenant ID:

```js
const response = await fetch(
  'https://api.ctxhub.net/api/public/collections/locations?limit=20',
  {
    headers: { 'X-Tenant-ID': 'your-tenant-id' },
  },
)

const { items, pagination } = await response.json()
```

Only use `/api/public/*` routes documented for browser delivery. Content and Media management endpoints remain server-side.

## Fetch one content item

```bash
curl --request GET \
  --url "https://api.ctxhub.net/api/contents/slug/welcome?status=published" \
  --header "Authorization: Bearer ctx_your_token"
```

## Production checklist

- Add an abort signal and request timeout.
- Handle `401`, `403`, `404`, `429`, and `5xx` separately using [Errors and retries](./errors.md).
- Observe monthly usage through [quota headers and the usage endpoint](./quotas.md).
- Cache safe published reads briefly and invalidate them from webhooks.
- Sanitize rich HTML before injecting it into a page.
- Redact authorization values from logs.
- Keep an explicit distinction between ContextHub Cloud services and community-repository features.

Next, open the [API reference](./api-reference.md). For editorial delivery read [Content](./content.md), [Collections](./collections.md), and [Media](./media.md); for ContextHub's personalization surface start with [Placements](./placements.md).
