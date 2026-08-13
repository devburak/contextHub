# Hatalar ve retry

ContextHub Cloud hataları HTTP status kodu ve JSON body kullanır. Uygulama hatalarının çoğu `error` ile `message` içerir; route ayrıca validation detayı veya domain'e özel alanlar ekleyebilir.

```json
{
  "error": "NotFound",
  "message": "Content not found"
}
```

İnsanlara yönelik `message` metnine göre dallanmayın. HTTP status ve kararlı `error` değerini kullanın; bilinmeyen yanıt şekli için güvenli fallback bırakın.

## Status referansı

| Status | Anlam | Client davranışı |
| --- | --- | --- |
| `400` | Geçersiz payload, query, identifier veya eksik tenant context | İsteği düzeltin; değiştirmeden tekrar denemeyin |
| `401` | Eksik, süresi dolmuş veya geçersiz authentication | Admin session'ı yenileyin veya server token'ını değiştirin; döngü kurmayın |
| `403` | Geçerli kimliğin yetkisiz olması, public read'in kapalı olması, tenant uyuşmazlığı veya Edge policy reddi | Durun; authorization, tenant, origin veya route seçimini düzeltin |
| `404` | Kaynak yok, unpublished veya caller için görünür değil | Kaynağı yok kabul edin; slug, status ve tenant'ı doğrulayın |
| `409` | Write mevcut durumla çakışıyor | Durumu yeniden okuyup çakışmayı çözmeden retry yapmayın |
| `429` | Kısa süreli throttle veya aylık istek kotası doldu | `Retry-After` ve kota header'larına uyun; hemen retry yapmayın |
| `5xx` | Geçici server veya dependency hatası | Güvenli/idempotent işi sınırlı exponential backoff ve jitter ile deneyin |

## Edge Gateway retleri

Yönetilen Edge Gateway, origin API çalışmadan önce isteği reddedebilir:

```json
{
  "error": "Unauthorized",
  "message": "Request rejected by edge policy."
}
```

veya:

```json
{
  "error": "Forbidden",
  "message": "Request rejected by edge policy."
}
```

Yaygın nedenler private route'u authentication olmadan çağırmak, public route'a private token eklemek, tenant uyuşmazlığı, kapalı public-read ayarı veya tenant için izin verilmeyen origin'dir. Retry öncesinde [Kimlik doğrulama ve tenant yapısı](./authentication.md) sayfasını inceleyin.

## Aylık kota aşıldı

Tükenmiş aylık istek kotası machine-readable payload ile `429` döner:

```json
{
  "error": "RequestLimitExceeded",
  "message": "Monthly API request limit exceeded. Please upgrade your plan or wait for the next billing cycle.",
  "messages": {
    "tr": "Aylik API istegi limiti asildi. Lutfen paketinizi yukseltin veya yeni donemi bekleyin.",
    "en": "Monthly API request limit exceeded. Please upgrade your plan or wait for the next billing cycle."
  },
  "limit": 100000,
  "usage": 100000,
  "periodKey": "2026-08",
  "resetAt": "2026-09-01T00:00:00.000Z"
}
```

Response header'ları ve proaktif kullanım kontrolü için [Kotalar ve kullanım](./quotas.md) sayfasını okuyun.

## Güvenli retry örüntüsü

```js
async function requestContextHub(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) })
  const body = await response.json().catch(() => null)

  if (response.ok) return body

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') || 0)
    throw new Error(`ContextHub quota or throttle reached; retry after ${retryAfter}s`)
  }

  if (response.status >= 500) {
    throw new Error('ContextHub is temporarily unavailable')
  }

  throw new Error(body?.error || `ContextHub returned ${response.status}`)
}
```

Yalnızca idempotent okumaları otomatik retry edin. Write işlemlerinde uygulama seviyesinde idempotency stratejisi kullanın veya açık onay isteyin. Deneme sayısını sınırlayın, jitter ekleyin ve raw authorization header'larını ya da müşteri payload'larını loglamayın.
