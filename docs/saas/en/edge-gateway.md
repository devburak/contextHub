# ContextHub Edge Gateway

All production API examples in this guide use `https://api.ctxhub.net`. Requests enter the managed ContextHub Edge Gateway before reaching tenant-scoped services.

## What the gateway does

- Classifies deliberately public `/api/public/*` routes and authenticated private routes.
- Resolves tenant configuration for public requests.
- Enforces tenant-specific browser CORS policy.
- Validates API-token and tenant consistency at the edge boundary.
- Applies managed rate-limit and abuse controls.
- Protects the origin so customers do not integrate with an origin hostname directly.
- Propagates operational request context for tracing and support.

The gateway is an operated `ctxhub.net` service. Its deployment code, provider configuration, secrets, and origin controls are not community-repository customer features.

## Customer responsibilities

1. Call only `https://api.ctxhub.net/api/...` in production.
2. Add each browser origin to the tenant's allowed-origin settings.
3. Add apex and wildcard subdomains separately when both are required.
4. Keep API tokens on trusted servers.
5. Send `X-Tenant-ID` only on documented public delivery requests.
6. Respect `429` responses and retry guidance.
7. Include ContextHub request IDs in support reports, but never include tokens.

## Public and private paths

```text
/api/public/*  -> public delivery policy + tenant identity
other /api/*   -> authenticated API or admin policy
```

Do not attach a `ctx_...` token to ordinary public reads. Do not use a public route as a proxy for private content. CORS is a browser permission boundary, not authentication.

## Development origins

Localhost access is controlled per tenant. When local development is not enabled, use an approved development domain rather than bypassing the gateway or disabling browser security.
