# Content

Content; sayfa, haber, yazı, duyuru, politika metni veya yeniden kullanılabilir editoryal blok gibi yayın yaşam döngüsü olan içerikler içindir. Editörlerin başlık, slug, rich body, kategori, etiket, zamanlama ve sürüm geçmişine ihtiyacı varsa doğru seçim Content'tir.

## Temel alanlar

| Alan | Amaç |
| --- | --- |
| `title` | Editör ve kullanıcıya gösterilen başlık |
| `slug` | Tenant içinde kararlı URL dostu lookup anahtarı |
| `status` | `draft`, `scheduled`, `published` veya `archived` |
| `summary` | Kart, liste, SEO veya ön izleme metni |
| `lexical` | Yapılandırılmış rich-text editör state'i |
| `html` | Render edilebilir rich-text; sayfaya eklemeden sanitize edin |
| `featuredMediaId` | Ana Medya referansı |
| `categories`, `tags` | Editoryal sınıflandırma ve filtreleme |
| `customFields` | Field definition key'leriyle tenant kapsamlı genişletilebilir değerler |
| `publishAt`, `publishedAt` | Zamanlama ve yayın tarihleri |
| `version` | Güncel içerik revision numarası |

## Published content listeleyin

Content sunumu sunucu tarafı API token kullanır:

```bash
curl --get "https://api.ctxhub.net/api/contents" \
  --header "Authorization: Bearer ctx_your_token" \
  --data-urlencode "status=published" \
  --data-urlencode "categoryName=Haberler" \
  --data-urlencode "page=1" \
  --data-urlencode "limit=20"
```

Filtreler arasında `search`, kategori/etiket ID veya isimleri, yayın tarih aralığı, pagination ve filterable custom field'lar bulunur.

## Slug ile getirin

Sayfa render ederken slug lookup tercih edin:

```js
const url = new URL('https://api.ctxhub.net/api/contents/slug/hakkimizda')
url.searchParams.set('status', 'published')

const response = await fetch(url, {
  headers: { Authorization: `Bearer ${process.env.CTX_API_TOKEN}` },
})

if (response.status === 404) return null
if (!response.ok) throw new Error(`Content request failed: ${response.status}`)
const { content } = await response.json()
```

## Custom field'lar

Custom field definition'lar content type veya kategoriye değil tenant'ın tamamına aittir. Text, number, boolean, date, select, multi-select, URL, JSON, reference ve multi-reference tipleri desteklenir.

- `public: true`: API-token cevabında değer gösterilebilir.
- `filterable: true`: `custom.<key>=value` filtresini açar.
- `searchable: true`: alanı text search'e dahil eder.
- Hassas alanları filterable yapmayın; sonuç sayıları ve slug'lar bilgi sızdırabilir.

```text
GET https://api.ctxhub.net/api/contents?status=published&custom.eventType=conference
```

## Render önerileri

- Kartlarda `summary`, detayda `html` kullanın.
- `html` değerini allow-list sanitizer ile temizleyin.
- Featured media'yı dönen relation veya sunucu medya servisinizle çözün.
- Published liste/detay okumalarını cache'leyin; preview, draft ve mutation'ları cache'lemeyin.
- ID'leri opaque kabul edin; public URL'leri slug'dan kurun.

Öncelikli ihtiyacınız editoryal doküman değil tipli tekrarlanabilir veri ise [Collections](./collections.md) kullanın.
