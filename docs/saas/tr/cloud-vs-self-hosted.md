# ContextHub Cloud ve self-hosted

ContextHub open-core'dur: community repo incelenebilir core sözleşmeleri ve uygulama temelini sağlar; `ctxhub.net` üzerindeki ContextHub Cloud ise işletilen multi-tenant servis sunar. Seçim yalnızca hosting değil, sorumluluk seçimidir.

## Güven sınırı

| Sorumluluk | Community self-hosted | ContextHub Cloud |
| --- | --- | --- |
| Runtime deploy ve scaling | Ekibiniz | ContextHub tarafından işletilir |
| Database, object storage, backup ve restore testi | Ekibiniz | Cloud servisi ve plana göre yönetilir |
| TLS, edge routing, tenant CORS, origin protection ve abuse kontrolleri | Ekibiniz tasarlar ve işletir | Yönetilen Edge Gateway |
| Upgrade, güvenlik patch'leri ve compatibility doğrulaması | Ekibiniz | Yönetilen release süreci |
| Monitoring, incident response ve capacity planning | Ekibiniz | Plana göre işletilen servis sorumluluğu |
| Core content, collection, media, menu, form ve placement sözleşmeleri | Repo sürümüne göre bulunur | Hosted ve bakımı yapılır |
| Semantic Search ve ticari pluginler | Açıkça yayınlanmadıkça veya ayrıca lisanslanmadıkça dahil değildir | Plan ve entitlement'a bağlı yönetilen yetenekler |
| Destek | Community kanalları ve kendi operatörleriniz | Plana göre ContextHub desteği |

Public kaynak görünürlüğü; private provider kodu, production altyapısı, credential, ticari paket, müşteri verisi veya availability taahhüdünün dahil olduğu anlamına gelmez.

## ContextHub Cloud'u seçin

- Full stack işletmeden `https://api.ctxhub.net/api` üzerinde production API istiyorsanız.
- Birden fazla müşteri tenant'ı için yönetilen izolasyon, edge policy, upgrade, backup ve destek gerekiyorsa.
- Yönetilen Semantic Search gibi plana bağlı yetenek ürün roadmap'inin parçasıysa.
- Ekibiniz CMS altyapısı yerine web sitesi ve uygulamalara odaklanmak istiyorsa.

## Self-hosted seçin

- Runtime, data plane, deploy takvimi ve altyapı kontrollerinin tamamına sahip olmanız gerekiyorsa.
- Ekibiniz MongoDB, Redis, object storage, email, queue, edge security, monitoring, backup ve recovery işletebiliyorsa.
- Upgrade'leri doğrulama ve entegrasyon compatibility'sini koruma sorumluluğunu kabul ediyorsanız.
- Yönetilen veya ticari yetenekleri varsaymadan community repoda yayınlanan fonksiyonlar yeterliyse.

## Taşınabilirlik beklentisi

Belgelenmiş REST ve webhook sözleşmelerine geliştirin, tenant identifier'larını açık tutun ve private provider resource'larına bağımlı olmayın. Bu yaklaşım uygulama kodunu ortamlar arasında daha anlaşılır kılar; ancak her Cloud yeteneğinin community deployment'ta bulunduğunu garanti etmez.

Migrasyon öncesinde şunları envantere alın:

1. Core kaynaklar ve content şemaları.
2. Media storage ve public URL'ler.
3. Tenant ayarları, origin'ler ve secret'lar.
4. Webhook consumer'ları ve cache invalidation.
5. Ticari plugin entitlement'ları ve fallback'ler.
6. Backup, recovery, monitoring ve incident response operasyon hedefleri.

Özellik sınırı için [Yönetilen ve ticari yetenekler](./managed-capabilities.md), Cloud entegrasyon sözleşmesi için [ContextHub Edge Gateway](./edge-gateway.md) sayfasını okuyun.
