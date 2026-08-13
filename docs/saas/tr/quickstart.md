# Hızlı başlangıç

ContextHub Cloud production API base URL'i:

```text
https://api.ctxhub.net/api
```

## Sunucu entegrasyonunu yapılandırın

API token'ı sunucunuzun secret manager'ında tutun.

```env
CTX_API_BASE_URL=https://api.ctxhub.net/api
CTX_API_TOKEN=ctx_your_token
```

Güvenilir bir sunucudan yayınlanmış içerikleri listeleyin:

```js
const response = await fetch(
  'https://api.ctxhub.net/api/contents?status=published&limit=10',
  {
    headers: {
      Authorization: `Bearer ${process.env.CTX_API_TOKEN}`,
    },
  },
)

if (!response.ok) throw new Error(`ContextHub returned ${response.status}`)
const result = await response.json()
```

API token tenant, rol ve scope bilgisini belirler. Body içinde farklı bir tenant göndermeyin.

## Tarayıcıdan public istek yapın

Public collection sunumunda private token kullanılmaz. Tarayıcı origin'inizi tenant ayarlarında tanımlayın ve tenant ID'yi gönderin:

```js
const response = await fetch(
  'https://api.ctxhub.net/api/public/collections/locations?limit=20',
  {
    headers: { 'X-Tenant-ID': 'your-tenant-id' },
  },
)

const { items, pagination } = await response.json()
```

Tarayıcıda yalnızca public sunum için belgelenmiş `/api/public/*` route'larını kullanın. Content ve Medya yönetim endpoint'leri sunucu tarafında kalmalıdır.

## Tek bir content kaydı getirin

```bash
curl --request GET \
  --url "https://api.ctxhub.net/api/contents/slug/welcome?status=published" \
  --header "Authorization: Bearer ctx_your_token"
```

## Canlı ortam kontrol listesi

- Abort signal ve timeout ekleyin.
- `401`, `403`, `404`, `429` ve `5xx` durumlarını ayrı yönetin.
- Güvenli published okumaları kısa süre cache'leyin; webhook ile invalidation yapın.
- Rich HTML'i sayfaya eklemeden önce sanitize edin.
- Authorization değerlerini loglardan çıkarın.
- ContextHub Cloud servisleriyle community repo özelliklerini açıkça ayırın.

[Content](./content.md), [Collections](./collections.md) ve [Medya](./media.md) ile devam edin.
