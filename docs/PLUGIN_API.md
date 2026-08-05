# ContextHub Plugin API

Bu belge public runtime plugin sozlesmesinin normatif ozetidir. Plugin kaynaklari
guvenilir deploy girdisidir; request veya tenant ayarindan modul yolu kabul edilmez.

## Yukleme

`CTXHUB_PLUGINS`, plugin manifest dosyalarinin mutlak yollarini JSON dizi olarak alir:

```env
CTXHUB_PLUGINS=["/opt/ctxhub/plugins/example/plugin.manifest.json"]
```

Bos veya tanimsiz deger community runtime davranisini degistirmez. Host tum
manifestleri boot sirasinda dogrular; surum, route, permission, feature veya consumer
cakismasinda process fail-fast durur.

## Runtime surumu

Guncel public extension contract'i:

- API version: `1`
- API revision: `3`
- Admin API version/revision: `1/2`
- Domain event schema version: `1`

Major `version` kirici degisikliklerde, `revision` ayni major icindeki geriye uyumlu
eklemelerde artar. Plugin manifesti ihtiyac duydugu minimum revision'i `apiRevision`
ile bildirir.

## Entrypoint

Manifest `entrypoints.api` ile ESM veya CJS modulunu gosterir. Modul en az
`registerApi` export etmelidir. Manifest consumer bildiriyorsa `registerConsumers` da
zorunludur:

```js
export async function registerApi(app, context) {}

export async function registerConsumers(context) {
  context.events.register('example-consumer', {
    types: ['content.updated'],
    batchSize: 100,
    maxAttempts: 8,
    initialPosition: 'latest',
    retry: {
      baseDelayMs: 1000,
      maxDelayMs: 300000,
      multiplier: 2,
    },
    async handle(events) {},
  })
}
```

API ve consumer process'leri ayni manifesti ayri ayri yukler. Process-ici kayitlar
paylasilmaz.

## Context

Context dondurulmus, dar ve versioned bir yuzeydir:

```js
{
  version,
  revision,
  plugin: { name, version },
  events,
  sources,
  auth,
  settings,
  log,
}
```

`context.sources` API revision 2 ile eklenmistir:

```js
await context.sources.getContentSnapshot({ tenantId, contentId })
await context.sources.getCollectionEntrySnapshot({
  tenantId,
  collectionKey,
  entryId,
})
```

Her iki metod da tenant sinirini sorguda uygular, kaynak yoksa `null` doner ve lifecycle
status'unu filtrelemez. Plugin `published/draft/archived` kararini kendi yetkili
politikasiyla verir. Content snapshot kategori/etiket etiketlerini ve custom field
definition metadata'sini; collection snapshot normalize `data` ve enum `dataLabels`
alanlarini tasir. Raw Mongoose model, Mongo client veya credential aciga cikmaz.

Source facade salt okunurdur. Plugin kaynak Content/CollectionEntry kayitlarini bu
yuzeyden olusturamaz, guncelleyemez veya silemez.

`context.auth` ve `context.settings` API revision 3 ile eklenmistir. Auth facade
yalniz manifestte bildirilen izinler icin session/JWT guard'i uretir; tenant ve user
kimligini dogrulanmis request context'inden verir. Settings facade plugin adiyla
namespace edilmis, tenant-scoped JSON ayarlarini optimistic revision kontroluyle
okur/yazar. Raw model veya baska plugin namespace'i aciga cikmaz.

API revision 4 `context.entitlements` facade'ini ekler. Plugin yalniz manifestinde
bildirdigi feature key'ler icin guard uretebilir; aktif tenant planinda feature yoksa
route `403 FeatureNotEntitled` doner. Commercial feature key'leri public core'da sabitlenmez.

Admin API revision 3, community fallback'li `virtual:ctxhub-plugins` girisini,
plugin page/menu kaydina ek olarak tenant tab, content-search ve content-editor panel
katkilarini ve bunlarin fail-fast kontrolunu ekler. Hosted composition
commercial admin kaynagini local workspace'ten verir; private npm registry gerekmez.

## Guvenlik siniri

- Manifest yollarini yalniz deploy composition belirler.
- Pluginler guvenilir uygulama kodudur; host bir guvenlik sandbox'i degildir.
- Private plugin core ic servis/model dosyalarini import etmemeli, yalniz context
  facade'larini kullanmalidir.
- Secret degerleri manifest, Git, log veya public health cevabina yazilmaz.
- Manifest permission guard'i revision 3, plan feature entitlement guard'i revision
  4'tedir. Authenticated commercial route'lar hem permission hem entitlement uygular.
  Public tenant aramasi ayrica opt-in, public entitlement ve rate limit tamamlanana
  kadar kapali kalir.
