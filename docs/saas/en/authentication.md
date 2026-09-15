# Authentication and tenancy

ContextHub Cloud has three trust boundaries. Use the narrowest boundary that supports the operation.

## API tokens for trusted servers

Send an API token from a backend, build service, migration, or other trusted runtime:

```http
Authorization: Bearer ctx_your_token
```

The token selects its tenant and carries its role and scopes. `GET`, `HEAD`, and `OPTIONS` require a valid token; mutations require the matching `write` or `delete` scope. Store tokens in a secret manager and rotate them.

## Public delivery for browsers

Deliberately public routes under `/api/public/*` use:

```http
X-Tenant-ID: your-tenant-id
```

The documented `tenantId` query parameter is also accepted. Do not add a `ctx_...` token to normal public reads; the ContextHub Edge Gateway rejects API tokens on public paths. Public form submission is the exception and requires a write-scoped token, so proxy it through a trusted server when the token must remain secret.

## Admin sessions

The ContextHub Cloud admin uses an HttpOnly session cookie, CSRF protection, tenant membership, roles, and permissions. Customer integrations should not imitate the admin login flow. Use an API token for automation.

## Tenant rules

- Authenticated tenant context is authoritative.
- A request body cannot switch tenants.
- Referenced media, content, and collection entries must belong to the same tenant.
- Public collection reads return published entries only.
- Content reads used by a public site should request `status=published` explicitly.
- API-token content responses expose only custom fields whose definitions are public.

## Common responses

- `401`: authentication is missing, invalid, or expired.
- `403`: the identity is known but lacks scope, role, permission, entitlement, or edge policy access.
- `404`: the resource does not exist or is intentionally hidden across a boundary.
- `429`: back off and respect retry guidance.

Never fail over to a default tenant when tenant resolution fails.
