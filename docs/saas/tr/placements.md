# Placements ve kişiselleştirme

Placements, frontend'deki tek bir konumda farklı banner, popup, inline blok, form, medya veya özel component sunmayı sağlar. ContextHub Cloud; tanımı, uygunluk kurallarını, ağırlıklı seçimi, olay akışını ve raporları tenant sınırında tutar.

## Temel model

Bir placement; kararlı bir `slug`, durum, tetikleyici, opsiyonel fallback ve bir veya daha fazla experience içerir. Experience; sunum içeriğini hedefleme kuralları, öncelik, ağırlık, zamanlama ve frequency limitleriyle birleştirir.

| Kavram | Amaç |
| --- | --- |
| Placement | `homepage-hero` veya `checkout-exit` gibi adlandırılmış karar noktası |
| Experience | Karar sonucunda dönebilecek içerik veya component |
| Rule | Request context'inin uygun olup olmadığını belirler |
| Priority | Seçimi en yüksek öncelikli uygun grupla sınırlar |
| Weight | Bu gruptaki experience'lar arasında trafiği böler |
| Event | Impression, click, conversion ve diğer sonuçları kaydeder |

Desteklenen experience içerik tipleri `form`, `html`, `text`, `image`, `video`, `component` ve `external`'dır. HTML ve harici URL'leri güvenilmeyen sunum girdisi kabul edin. Content ve media ID'leri referanstır; istemci ilgili kaynağı ayrıca getirir.

## Yönetim yaşam döngüsü

Placement okumaları authenticated tenant caller; create, update, archive, duplicate ve delete işlemleri editor seviyesinde admin oturumu ister.

```text
GET    https://api.ctxhub.net/api/placements
POST   https://api.ctxhub.net/api/placements
GET    https://api.ctxhub.net/api/placements/:id
PUT    https://api.ctxhub.net/api/placements/:id
DELETE https://api.ctxhub.net/api/placements/:id
POST   https://api.ctxhub.net/api/placements/:id/archive
POST   https://api.ctxhub.net/api/placements/:id/duplicate
```

Experience'lar placement altında ayrı ekleme, güncelleme ve silme işlemlerine sahiptir. Kanıtlanmış bir ayardan kampanya üretirken duplicate kullanın; raporlama bağlamını kaybetmeden gösterimi durdurmak için archive edin.

## Frontend akışı

1. Sayfa ve session context'iyle karar isteyin.
2. Yalnız dönen experience'ı render edin ve trigger'ını uygulayın.
3. Impression'ı seçim anında değil, görünür olduğunda kaydedin.
4. Click, submit, close veya conversion event'lerini asenkron gönderin.
5. Kişiselleştirilmiş kararları ortak cache'e koymayın.

React veya vanilla entegrasyonlarında `@contexthub/promo-sdk` kullanabilir ya da public endpoint'leri doğrudan çağırabilirsiniz. [Karar motoru ve hedefleme](./placement-decisions.md), [Experience ve A/B testleri](./placement-experiments.md) ve [Event ve analitik](./placement-events.md) ile devam edin.
