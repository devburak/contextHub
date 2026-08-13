# API referansı

ContextHub Cloud, insanlara yönelik entegrasyon rehberleriyle çalıştırılabilir API sözleşmesini birbirinden ayırır. İki dokümantasyon yüzeyi bilinçli olarak farklı host ve canonical path kullanır.

| Yüzey | Canonical URL | Amaç |
| --- | --- | --- |
| Geliştirici rehberleri | `https://ctxhub.net/docs` | Kavramlar, entegrasyon örüntüleri, cache, migrasyon ve yönetilen servis sınırları |
| REST API base | `https://api.ctxhub.net/api` | Production API istekleri |
| İnteraktif Swagger UI | [https://api.ctxhub.net/api/docs](https://api.ctxhub.net/api/docs) | OpenAPI sözleşmesini incelemek ve yetkili istek çalıştırmak |
| OpenAPI JSON | [https://api.ctxhub.net/api/docs/json](https://api.ctxhub.net/api/docs/json) | SDK üretimi ve contract araçları |
| OpenAPI YAML | [https://api.ctxhub.net/api/docs/yaml](https://api.ctxhub.net/api/docs/yaml) | Okunabilir OpenAPI kaynağı |

`https://api.ctxhub.net/docs` adresini kullanmayın. Yönetilen Edge Gateway, Swagger'ı `/api/docs` üzerinden sunar; kökteki `/docs` yolu public API-reference sözleşmesi değildir.

## Kimlik doğrulama sınırları

Güvenilir sunucu isteklerinde `Authorization: Bearer ctx_your_token` kullanın. Token tenant, rol ve scope bilgisini belirler. Token'ı tarayıcı koduna koymayın.

Tarayıcı sunumu, private token olmadan belgelenmiş `/api/public/*` route'larını ve `X-Tenant-ID` header'ını kullanır. Form gönderimi istisnadır: `POST /api/public/forms/:formId/submit` write scope'lu API token ister; token korunamıyorsa istek güvenilir sunucunuz üzerinden proxy edilmelidir.

Tam sınır için [Kimlik doğrulama ve tenant yapısı](./authentication.md) sayfasını okuyun.

## Temel route aileleri

| Kaynak | Temsilî route'lar | Tipik kullanım |
| --- | --- | --- |
| Content | `GET /api/contents`, `GET /api/contents/slug/:slug` | Sayfalar, haberler, yazılar ve tekrar kullanılan editoryal bloklar |
| Collections | `GET /api/public/collections/:key`, `POST /api/public/queries/run` | Tipli tekrarlanabilir iş verisi ve public sorgular |
| Media | `POST /api/media/presign`, `POST /api/media`, `GET /api/media` | Upload kaydı, metadata, variant ve harici medya |
| Menus | `GET /api/public/menus/slug/:slug` | Public navigasyon ağaçları |
| Forms | `GET /api/public/forms/:slug`, `POST /api/public/forms/:id/submit` | Form tanımları ve gönderimler |
| Placements | `POST /api/public/placements/decide`, `POST /api/public/placements/events/batch` | Kişiselleştirme, deney, event toplama, funnel, realtime rapor ve journey |
| Galeriler | `GET /api/galleries`, `PUT /api/contents/:id/galleries` | Editoryal content'e bağlı sıralı media setleri |
| Roller | `GET /api/roles`, `PUT /api/users/:id/role` | Tenant-scoped sistem ve custom rol yönetimi |
| Activity | `GET /api/activities`, `GET /api/dashboard/api-stats` | Security activity ve operasyon dashboard verisi |
| Extensions | Versioned Plugin API | Güvenilir route, event consumer, settings, entitlement ve admin katkıları |
| Tenant | `GET /api/tenant/info` | Tenant kimliği, branding ve entegrasyon metadata'sı |
| Usage | `GET /api/tenants/current/limits` | Plan limitleri ve güncel tenant kullanımı |

Tam route ve şema listesinin otoritesi interaktif sözleşmedir. Bu rehberler, sözleşmelerin güvenli kullanımını açıklar.

## Yanıt yönetimi

Başarılı liste ve detay şekilleri kaynağa göre değişir. Bir alana bağımlı olmadan önce Swagger şemasını kontrol edin ve yanıtı uygulama sınırınızda normalize edin.

Status ailelerini ayrı yönetin:

- Geçersiz input veya tenant context için `400`.
- Eksik ya da geçersiz authentication için `401`.
- Yetkisi olmayan authenticated caller veya Edge policy reddi için `403`.
- Bulunamayan veya public olmayan kaynak için `404`.
- Duplicate slug gibi çakışan write için `409`.
- Throttle veya tükenmiş plan kotası için `429`.
- Geçici servis hataları için `5xx`.

[Placements ve kişiselleştirme](./placements.md), [Roller ve izinler](./roles-permissions.md), [Extensions](./extensions.md), [Hatalar ve retry](./errors.md) ve [Kotalar ve kullanım](./quotas.md) ile devam edin.
