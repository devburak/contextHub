# Errors and retries

ContextHub Cloud errors use HTTP status codes and a JSON body. Most application errors include `error` and `message`; a route may add validation details or domain-specific fields.

```json
{
  "error": "NotFound",
  "message": "Content not found"
}
```

Do not branch on the human-readable `message`. Branch on the HTTP status and stable `error` value, and keep a safe fallback for an unknown response shape.

## Status reference

| Status | Meaning | Client action |
| --- | --- | --- |
| `400` | Invalid payload, query, identifier, or missing tenant context | Fix the request; do not retry unchanged |
| `401` | Missing, expired, or invalid authentication | Refresh an admin session or replace the server token; do not loop |
| `403` | Valid identity without permission, public read disabled, tenant mismatch, or Edge policy rejection | Stop and correct authorization, tenant, origin, or route choice |
| `404` | Resource is missing, unpublished, or not visible to this caller | Treat as absent; verify slug, status, and tenant |
| `409` | Write conflicts with current state | Re-read state and resolve the conflict before retrying |
| `429` | Short-term throttle or monthly request quota exhausted | Respect `Retry-After` and quota headers; do not retry immediately |
| `5xx` | Transient server or dependency failure | Retry safe/idempotent work with bounded exponential backoff and jitter |

## Edge Gateway rejections

The managed Edge Gateway can reject a request before the origin API runs:

```json
{
  "error": "Unauthorized",
  "message": "Request rejected by edge policy."
}
```

or:

```json
{
  "error": "Forbidden",
  "message": "Request rejected by edge policy."
}
```

Common causes are using a private route without authentication, attaching a private token to a public route, a tenant mismatch, a disabled public-read setting, or an origin that is not allowed for that tenant. Review [Authentication and tenancy](./authentication.md) before retrying.

## Monthly quota exceeded

An exhausted monthly request quota returns `429` with a machine-readable payload:

```json
{
  "error": "RequestLimitExceeded",
  "message": "Monthly API request limit exceeded. Please upgrade your plan or wait for the next billing cycle.",
  "messages": {
    "tr": "Aylik API istegi limiti asildi. Lutfen paketinizi yukseltin veya yeni donemi bekleyin.",
    "en": "Monthly API request limit exceeded. Please upgrade your plan or wait for the next billing cycle."
  },
  "limit": 100000,
  "usage": 100000,
  "periodKey": "2026-08",
  "resetAt": "2026-09-01T00:00:00.000Z"
}
```

Read [Quotas and usage](./quotas.md) for response headers and proactive usage checks.

## Safe retry pattern

```js
async function requestContextHub(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) })
  const body = await response.json().catch(() => null)

  if (response.ok) return body

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') || 0)
    throw new Error(`ContextHub quota or throttle reached; retry after ${retryAfter}s`)
  }

  if (response.status >= 500) {
    throw new Error('ContextHub is temporarily unavailable')
  }

  throw new Error(body?.error || `ContextHub returned ${response.status}`)
}
```

Only retry idempotent reads automatically. For writes, use an application idempotency strategy or require explicit confirmation. Cap attempts, add jitter, and never log raw authorization headers or customer payloads.
