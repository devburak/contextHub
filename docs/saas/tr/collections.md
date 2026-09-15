# Collections

Collections; şube, ekip üyesi, ürün, etkinlik, SSS, konum veya ortak şemaya sahip herhangi bir kayıt seti gibi tipli ve tekrarlanabilir iş verileri içindir. Bir collection kararlı `key`, çok dilli isim, field definition'lar ve yayın ayarlarına sahiptir.

## Ne zaman collection kullanılmalı

Uygulama field bazlı filtreleme, sıralama, relation, çok dilli enum label veya GeoJSON istiyorsa Collection seçin. Editörlerin temel ihtiyacı kategori ve yayın metadata'sı olan zengin bir sayfa yazmaksa Content seçin.

## Field tipleri

| Tip | Tipik kullanım |
| --- | --- |
| `string`, `text` | İsim, kod, kısa ve uzun düz metin |
| `richText` | Yapılandırılmış editör JSON'ı ve render edilebilir HTML |
| `number`, `boolean` | Sayısal değer ve switch |
| `date`, `datetime` | Takvim tarihi ve zamanlı etkinlik |
| `enum` | Çok dilli label içeren kontrollü seçenekler |
| `ref` | Başka bir collection entry bağlantısı |
| `media` | Medya kaydı bağlantısı |
| `geojson` | Harita geometrisi; point koordinatı `[longitude, latitude]` sırasındadır |

Field'lar required, unique veya indexed olabilir; default value alabilir. Collection ayarları slug field, default sıralama, draft davranışı, versioning ve preview URL'ini belirler.

## Public entry yapısı

```json
{
  "id": "entry-id",
  "collectionKey": "locations",
  "slug": "istanbul-office",
  "status": "published",
  "data": {
    "name": "İstanbul Ofisi",
    "location": { "type": "Point", "coordinates": [28.9784, 41.0082] }
  },
  "dataLabels": {},
  "relations": { "contents": [], "media": [], "refs": [] }
}
```

`data` şemadaki değerleri, `dataLabels` enum'ların locale map'lerini, `relations` ise content, medya veya diğer collection entry bağlantılarını taşır.

## Published entry listeleyin

```bash
curl --get "https://api.ctxhub.net/api/public/collections/locations" \
  --header "X-Tenant-ID: your-tenant-id" \
  --data-urlencode "page=1" \
  --data-urlencode "limit=20"
```

Slug ile tek kayıt:

```text
GET https://api.ctxhub.net/api/public/collections/locations/istanbul-office
X-Tenant-ID: your-tenant-id
```

İki public route da yalnızca published entry döndürür.

## Query DSL

Seçili alanlar, filtre, sıralama, pagination ve kontrollü relation hydration için public query endpoint'ini kullanın:

```js
const response = await fetch('https://api.ctxhub.net/api/public/queries/run', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your-tenant-id',
  },
  body: JSON.stringify({
    collection: 'locations',
    select: ['slug', 'data.name', 'data.location'],
    where: [['data.isActive', 'eq', true]],
    orderBy: [['data.name', 'asc']],
    limit: 50,
  }),
})
```

Public collection endpoint'leri rate limited'dır. Kararlı cevapları cache'leyin; her component için ayrı query göndermeyin.

## Rich text ve relation

Bir `richText` değeri `{ json, html }` biçimindedir. Gösterimde `html` kullanıp sanitize edin. `includeRelations` yalnızca gerektiğinde istenmelidir; dönen relation'lar da tenant ve publication kapsamında doğrulanır.
