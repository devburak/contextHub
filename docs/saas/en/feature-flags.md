# Feature flags

ContextHub supports named feature definitions and tenant-specific runtime values. Use them to roll application behavior out per tenant without cloning content models.

## Define and enable

Administrators can list and create definitions:

```text
GET  https://api.ctxhub.net/api/feature-flags
POST https://api.ctxhub.net/api/feature-flags
```

A definition has a unique key, label, description, default state, and notes. Definitions form a shared catalog; tenant-specific values are stored separately. The current definition API does not expose update or delete operations, so choose durable keys.

Tenant values live in the `features` map returned and updated through:

```text
GET https://api.ctxhub.net/api/tenant-settings
PUT https://api.ctxhub.net/api/tenant-settings
```

Reading needs tenant settings view/manage permission; changing values needs manage permission. Treat missing values according to the definition's default and keep rollout decisions tenant-scoped.

## Placement flags are explicit context

Placement rules can require or exclude feature-flag names, but the public decision endpoint does not automatically load tenant settings. Your caller must pass the relevant values in `context.featureFlags`.

```json
{
  "placement": "homepage-hero",
  "context": {
    "path": "/",
    "sessionId": "session-8e5d",
    "featureFlags": ["new-home"]
  }
}
```

Feature flags are deployment controls, not permissions. Protect sensitive operations with [roles and permissions](./roles-permissions.md), even when a UI is hidden by a flag.
