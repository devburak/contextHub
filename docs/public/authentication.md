# Authentication and tenancy

ContextHub has three distinct trust boundaries. Choose the narrowest one that supports the operation.

## Public delivery

Use `/api/public/*` for published, tenant-scoped delivery. Send `X-Tenant-ID` or the endpoint's documented `tenantId` query parameter. Do not attach a `ctx_...` token to ordinary public delivery calls.

Public form submission is a documented exception: it can require an authorization credential even though it belongs to the public forms surface. Follow the endpoint contract rather than inferring authentication from the URL alone.

## API token authentication

Trusted services can send:

```http
Authorization: Bearer ctx_REDACTED
X-Tenant-ID: tenant-key
```

API tokens are secrets. Store them in a server-side secret manager, rotate them, scope them to required permissions, and revoke unused tokens. A token must never be embedded in a browser bundle.

## Admin session authentication

The ContextHub admin uses a secure session cookie, CSRF protection, tenant membership, roles, and permissions. Do not emulate this flow from a public integration. Use the supported admin UI or a scoped API token for automation.

## Tenant selection rules

- The authenticated tenant context is authoritative for private operations.
- A body field must not override the authenticated tenant.
- Cross-tenant identifiers are rejected even when their MongoDB/ObjectId format is valid.
- Referenced media, collection entries, and content must belong to the same tenant.
- Public queries must enforce publication status and tenant ownership before hydration.

## CORS and the edge gateway

Browser access is allowed only from tenant-configured origins. In production, route traffic through the Cloudflare Edge Gateway so origin protection, tenant CORS, and public/private endpoint policy are applied consistently.

`X-Forwarded-For` is a chain, not an authenticated identity. At a trusted proxy boundary, derive the client address from a Cloudflare-provided address header or from the correct trusted hop. Never use the first attacker-supplied value as a rate-limit key.

## Failure handling

- `401` means authentication is missing, invalid, or expired.
- `403` means the identity is known but lacks tenant membership, entitlement, or permission.
- `404` may intentionally hide a cross-tenant or unpublished resource.
- `429` means the client must respect the response's retry guidance and back off.

Fail closed when the tenant cannot be established. Do not silently fall back to a default tenant.
