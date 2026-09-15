# API token lifecycle

API tokens authenticate trusted server integrations. Token management is owner-only, and the plaintext `ctx_...` value is returned once when created.

## Create with least privilege

```http
POST https://api.ctxhub.net/api/api-tokens
Authorization: Bearer <owner-session-token>
Content-Type: application/json

{
  "name": "production website reads",
  "role": "viewer",
  "scopes": ["read"],
  "expiresInDays": 90
}
```

The effective authorization is the intersection of the selected role's permissions and the token scopes `read`, `write`, and `delete`. A broad role does not bypass a missing token scope.

Store the returned token in a secret manager immediately. ContextHub stores a SHA-256 hash and cannot display the value again. Never put it in browser JavaScript, URLs, analytics, source control, or logs.

## Inventory and expiry

`GET /api/api-tokens` returns token metadata including name, role, scopes, `expiresAt`, `lastUsedAt`, creation time, and creator—never the secret or its hash. Give every workload its own token so usage and revocation remain attributable.

`expiresInDays: 0` creates a non-expiring token. Prefer a finite expiry and alert before it. A token's name and scopes can be updated with `PUT /api/api-tokens/:tokenId`; role and expiry are fixed at creation.

## Rotate without downtime

There is no in-place secret rotation operation:

1. Create a replacement token with the required role, scopes, and expiry.
2. Store and deploy the new value to every consumer.
3. Verify successful requests and observe `lastUsedAt`.
4. Revoke the old token with `DELETE /api/api-tokens/:tokenId`.

Treat deletion as immediate revocation. Keep an emergency owner session available; never depend on the token being rotated to revoke itself.

See [Authentication and tenancy](./authentication.md) for where API tokens are accepted.
