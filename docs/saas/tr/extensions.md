# Extensions ve Plugin API

ContextHub open core, güvenilir deployment plugin'leri için versioned bir host sözleşmesi sunar. Plugin'ler core kaynaklarını patch etmeden API route, domain event consumer, tenant settings, entitlement guard ve admin katkıları ekleyebilir.

Plugin'ler deployment kodudur; tenant'ın yüklediği script'ler değildir. Host bir güvenlik sandbox'ı değildir.

## Runtime uyumluluğu

Güncel public sözleşmeler:

- API version/revision: `1/4`
- Admin API version/revision: `1/3`
- Domain event schema version: `1`

Manifest; minimum uyumlu revision'ları, route prefix'i, permission'ları, feature key'leri, event tiplerini, consumer'ları ve entrypoint'leri bildirir. Host boot sırasında tüm manifestleri doğrular; uyumsuz sürüm, çakışma, geçersiz path veya eksik export durumunda fail-fast durur.

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

API modülü `registerApi`; consumer bildiren manifest ayrıca `registerConsumers` export eder.

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

Freeze edilmiş context; version metadata, namespaced settings, yapılandırılmış log, domain event, authentication guard, entitlement guard ve tenant-scoped read-only content/collection snapshot sağlar. Raw Mongoose model, database client veya credential açmaz.

## Güvenlik ve dağıtım

- Absolute manifest path'lerini yalnız güvenilir deployment composition (`CTXHUB_PLUGINS`) ile yapılandırın.
- HTTP request veya tenant setting'den module path kabul etmeyin.
- Secret'ları manifest, Git, log veya health response yerine runtime secret binding'lerinde tutun.
- Her permission, feature key, route prefix ve event consumer'ı bildirin.
- Authenticated ticari route'larda permission ve entitlement guard'larını birlikte uygulayın.
- API ve consumer entrypoint'lerini ilgili process'lerde bağımsız yükleyin.

Community host ve sözleşme public'tir; hosted ticari plugin'ler ve operasyon servisleri yalnız ContextHub Cloud planlarıyla sunulabilir. Repodaki normatif kaynak [PLUGIN_API.md](https://github.com/devburak/contextHub/blob/main/docs/PLUGIN_API.md)'dir.
