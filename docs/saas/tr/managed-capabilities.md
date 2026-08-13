# Yönetilen ve ticari yetenekler

ContextHub open-core model kullanır. Bu doküman `ctxhub.net` SaaS hizmetini anlattığı için bazı yetenekler community repoyu clone ederek elde edilen özellikler değil, işletilen servis veya ticari pluginlerdir.

Operasyonel sorumluluk ve güven karşılaştırması için [ContextHub Cloud ve self-hosted](./cloud-vs-self-hosted.md) sayfasından başlayın.

## Yetenek sınırı

| Yetenek | Community repo | ContextHub Cloud |
| --- | --- | --- |
| Core content, collection, media, menu, form ve placement sözleşmeleri | Repo sürümüne göre bulunur | Müşteriler için işletilir ve güncellenir |
| Admin uygulaması ve extension host | Repo sürümüne göre bulunur | Hosted tenant yönetimi |
| API edge, tenant CORS, origin koruması, abuse kontrolleri | Entegrasyon sözleşmeleri görülebilir | Yönetilen Edge Gateway servisi |
| Medya storage ve delivery operasyonları | Adapter kodu bulunabilir | Yönetilen storage, variant ve delivery yapılandırması |
| Semantic Search | Yalnızca extension sözleşmeleri | Plana bağlı yönetilen ticari yetenek |
| Private/ticari pluginler | Her zaman dahil değildir | Entitlement ve plana göre açılır |
| Monitoring, backup, upgrade ve support | Self-managed | Plana göre işletilen servis sorumluluğu |

Repo görünürlüğü; private provider kodu, altyapı yapılandırması, secret, ticari plugin paketi veya işletilen servisin dahil olduğu anlamına gelmez.

## Entitlement ve permission

Ticari yetenek hem tenant entitlement hem kullanıcı/servis permission ister. Navigasyon öğesini gizlemek authorization değildir; son kararı API uygular. Yetenekler plan, bölge, rollout aşaması veya tenant yapılandırmasına göre farklı olabilir.

## Entegrasyon kuralı

Internal provider resource'ları yerine belgelenmiş ContextHub Cloud API yüzeyine geliştirin. Plana bağlı bir yeteneği lansman bağımlılığı yapmadan önce ContextHub destek ile availability'yi doğrulayın.

## Destek bilgisi

Sorun bildirirken tenant identifier, request ID, timestamp, route family ve görülen status'ü ekleyin. Raw API token, webhook secret, parola veya müşteri kişisel verisi eklemeyin.
