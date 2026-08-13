# Plugins and commercial capabilities

ContextHub plugins add API routes, admin pages, domain-event consumers, settings, and commercial capabilities without weakening the core tenant boundary.

## Versioned contract

A plugin manifest declares its core compatibility range, API and admin contract revisions, route prefix, entrypoints, permissions, feature keys, and consumed domain events. The host rejects unsupported revisions, reserved routes, and declaration collisions.

```json
{
  "schemaVersion": 1,
  "name": "example-plugin",
  "apiVersion": 1,
  "apiRevision": 4,
  "adminApiVersion": 1,
  "adminApiRevision": 3,
  "routePrefix": "/api/plugins/example-plugin",
  "permissions": ["example.query", "example.configure"],
  "featureKeys": ["example.enabled"]
}
```

Values above demonstrate the current host contract; a real plugin must also declare valid entrypoints and any domain events or consumers it uses.

## Capability facades

Plugins should use host-provided facades instead of importing internal models or database connections. Facades keep tenant identity, permission checks, source reads, settings revisions, and entitlements inside the public extension contract.

## Permission and entitlement model

- Permissions authorize an action for the current tenant member or service identity.
- Feature entitlements determine whether a commercial capability is enabled for the tenant.
- Settings are tenant-scoped and use optimistic revisions where concurrent edits matter.
- Admin navigation must hide unavailable features, but the API remains the final enforcement point.

## Commercial plugin example

The Semantic Search plugin contributes query and configuration permissions, related-content management, indexing consumers, an API route namespace, and admin UI panels. Its Cloudflare resources are derived systems and cannot write source content.

## Plugin best practices

- Declare the smallest permission and event surface.
- Reject tenant identifiers from untrusted bodies when an authenticated context exists.
- Use deterministic idempotency keys for event consumers.
- Keep secrets and provider resource IDs out of manifests.
- Add contract tests for unsupported revisions, permission denial, and cross-tenant access.
- Make installation reversible and derived data rebuildable.
- Expose health and operational metrics without exposing customer content.

For the retrieval implementation, continue to [Semantic search](./semantic-search.md).
