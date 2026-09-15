# Custom field tanımları

Custom field definition'ları yeni bir content modelini koda sabitlemeden editoryal içeriğe tenant genelinde tipli alanlar kazandırır. Bir key'i content kaydında kullanmadan önce field'ı tanımlayın.

```text
GET    https://api.ctxhub.net/api/custom-field-definitions
POST   https://api.ctxhub.net/api/custom-field-definitions
PUT    https://api.ctxhub.net/api/custom-field-definitions/:id
DELETE https://api.ctxhub.net/api/custom-field-definitions/:id
```

Definition yönetimi authenticated editor ister. Admin oturumları tüm definition'ları okuyabilir; API token okumaları yalnız `public` işaretli definition'ları gösterir.

## Desteklenen tipler

`text`, `number`, `boolean`, `date`, `select`, `multi-select`, `url`, `json`, `reference` ve `multi-reference` desteklenir. Select tipleri option tanımlarını içerir. Reference field'lar metadata olarak `referenceCollectionKey` bildirebilir.

Key'ler normalize edilir ve oluşturulduktan sonra değişmez. `seo_title` veya `event_speakers` gibi tenant genelinde düz bir adlandırma standardı kullanın; aynı key'i uyumsuz anlamlarla tekrar kullanmayın.

## Sunum kontrolleri

- `public`, API token tüketicilerinin definition'ı keşfedip keşfedemeyeceğini belirler.
- `filterable` ve `searchable` index katılımını kontrol eder; değiştiklerinde index rebuild tetiklenebilir.
- `defaultValue` açıklayıcı ayardır; sunucu değeri mevcut veya yeni kaydedilen content'e otomatik yazmaz.
- `referenceCollectionKey` niyeti belgeler fakat bugün server-side zorunlu kılınmaz veya otomatik dereference edilmez.

Değerleri editor ve tüketicide doğrulayın. Reference ID'lerini tenant-scoped pointer kabul edin, hedefleri ilgili API'den getirin ve silinen definition'ın saklanmış content değerlerini kaldırdığını varsaymayın.

Oluşan değerlerin kullanımı için [Content](./content.md) sayfasına bakın.
