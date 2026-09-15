# Extensions and Plugin API

The ContextHub open core exposes a versioned host contract for trusted deployment plugins. Plugins can add API routes, domain-event consumers, tenant settings, entitlement guards, and admin contributions without patching core source files.

Plugins are deployment code, not tenant-uploaded scripts. The host is not a security sandbox.

## Runtime compatibility

The current public contracts are:

- API version/revision: `1/4`
- Admin API version/revision: `1/3`
- Domain event schema version: `1`

A manifest declares the minimum compatible revisions, route prefix, permissions, feature keys, event types, consumers, and entrypoints. The host validates every configured manifest during boot and fails fast on incompatible versions, collisions, invalid paths, or missing exports.

```json
{
  "schemaVersion": 1,
  "name": "example-search",
  "version": "1.0.0",
  "coreVersionRange": ">=0.1.0",
  "apiVersion": 1,
  "apiRevision": 4,
  "adminApiVersion": 1,
  "adminApiRevision": 3,
  "eventSchemaVersion": 1,
  "routePrefix": "/api/example-search",
  "permissions": ["content:view"],
  "featureKeys": ["example-search"],
  "entrypoints": { "api": "./api.js", "admin": "./admin.js" }
}
```

## API entrypoint

The API module exports `registerApi`; a manifest with consumers also exports `registerConsumers`.

```js
export async function registerApi(app, context) {
  app.get('/status', {
    preHandler: [
      ...context.auth.require({ permissions: ['content:view'] }),
      context.entitlements.require({ features: ['example-search'] }),
    ],
  }, async (request) => ({
    tenantId: context.auth.tenantId(request),
    enabled: true,
  }))
}
```

The frozen context provides version metadata, namespaced settings, structured logging, domain events, authentication guards, entitlement guards, and tenant-scoped read-only content and collection snapshots. It does not expose raw Mongoose models, database clients, or credentials.

## Security and distribution

- Configure absolute manifest paths only through trusted deployment composition (`CTXHUB_PLUGINS`).
- Never accept a module path from an HTTP request or tenant setting.
- Keep secrets in runtime secret bindings, not manifests, Git, logs, or health responses.
- Declare every permission, feature key, route prefix, and event consumer.
- Apply both permission and entitlement guards to authenticated commercial routes.
- Load API and consumer entrypoints independently in their respective processes.

The community host and contract are public; hosted commercial plugins and their operational services may be available only through ContextHub Cloud plans. The repository's normative source is [PLUGIN_API.md](https://github.com/devburak/contextHub/blob/main/docs/PLUGIN_API.md).
