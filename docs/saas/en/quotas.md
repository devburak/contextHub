# Quotas and usage

ContextHub Cloud plans can include a monthly API request quota. Integrations should observe the quota before it is exhausted, reduce avoidable traffic through caching, and handle `429` without a retry storm.

Quota is a billing and service-usage boundary. It is separate from short-window abuse throttles, authentication, permissions, and tenant suspension.

## Response headers

When the monthly quota snapshot is available and a tenant-scoped request passes through the quota guard, the API returns both structured draft fields and widely supported compatibility fields.

```http
RateLimit-Policy: "monthly";q=100000
RateLimit: "monthly";r=18420;t=864000
X-RateLimit-Limit: 100000
X-RateLimit-Remaining: 18420
X-RateLimit-Reset: 1788220800
X-RateLimit-Period: 2026-08
```

| Header | Meaning |
| --- | --- |
| `RateLimit-Policy` | Monthly policy and allocated request quota |
| `RateLimit` | Approximate requests remaining and seconds until reset |
| `X-RateLimit-Limit` | Monthly request limit for compatibility clients |
| `X-RateLimit-Remaining` | Non-negative approximate remaining requests |
| `X-RateLimit-Reset` | Reset time as a Unix timestamp in seconds |
| `X-RateLimit-Period` | Billing period key in `YYYY-MM` form |
| `Retry-After` | Seconds before retry; returned when the monthly quota is exhausted |

The structured `RateLimit` fields follow the active IETF HTTPAPI draft and may evolve before becoming an RFC. Compatibility clients may use `X-RateLimit-*`. Treat every value as an advisory snapshot: usage counters are aggregated asynchronously and the current request may not yet appear.

Headers may be absent on quota-exempt routes or when the metering store is unavailable. Absence does not promise unlimited service.

## Query current usage

Use the authenticated current-tenant endpoint for a deliberate dashboard or scheduled check:

```bash
curl --request GET \
  --url "https://api.ctxhub.net/api/tenants/current/limits" \
  --header "Authorization: Bearer ctx_your_token"
```

The response includes the effective plan, limits, and usage metrics. The request-quota metric contains current usage, limit, remaining, percentage, and whether the limit is unlimited.

Do not call this endpoint before every API request. Read response headers on normal traffic and poll the usage endpoint at a low frequency for dashboards or alerts.

## Handle quota exhaustion

An exhausted monthly quota returns `429 RequestLimitExceeded`:

```json
{
  "error": "RequestLimitExceeded",
  "message": "Monthly API request limit exceeded. Please upgrade your plan or wait for the next billing cycle.",
  "limit": 100000,
  "usage": 100000,
  "periodKey": "2026-08",
  "resetAt": "2026-09-01T00:00:00.000Z"
}
```

When `error` is `RequestLimitExceeded`:

1. Stop automatic retries for the affected tenant.
2. Use `Retry-After` or `resetAt` to schedule recovery.
3. Serve a safe cached representation when your freshness policy permits it.
4. Alert the tenant administrator before the failure becomes user-visible.
5. Review the plan or reduce traffic; do not rotate tokens to bypass quota.

## Budget-aware integration

- Cache published reads for a short bounded TTL and invalidate them through webhooks.
- Deduplicate identical requests during SSR or a single render.
- Include tenant, normalized path/query, locale, and representation version in cache keys.
- Avoid polling when webhooks can drive freshness.
- Track remaining quota at warning thresholds such as 20%, 10%, and 5%.
- Keep public and authenticated cache entries separate.

See [Caching and freshness](./caching.md) and [Errors and retries](./errors.md).
