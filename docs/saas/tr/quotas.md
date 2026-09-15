# Kotalar ve kullanım

ContextHub Cloud planları aylık API istek kotası içerebilir. Entegrasyonlar kotayı tükenmeden gözlemlemeli, cache ile önlenebilir trafiği azaltmalı ve retry storm oluşturmadan `429` yanıtını yönetmelidir.

Kota bir billing ve servis-kullanım sınırıdır. Kısa pencereli abuse throttle, authentication, permission ve tenant suspension'dan ayrıdır.

## Response header'ları

Aylık kota snapshot'ı erişilebilir olduğunda ve tenant-scoped istek quota guard'dan geçtiğinde API hem yapılandırılmış draft alanlarını hem yaygın compatibility alanlarını döndürür.

```http
RateLimit-Policy: "monthly";q=100000
RateLimit: "monthly";r=18420;t=864000
X-RateLimit-Limit: 100000
X-RateLimit-Remaining: 18420
X-RateLimit-Reset: 1788220800
X-RateLimit-Period: 2026-08
```

| Header | Anlamı |
| --- | --- |
| `RateLimit-Policy` | Aylık politika ve tanımlı istek kotası |
| `RateLimit` | Yaklaşık kalan istek ve reset'e kalan saniye |
| `X-RateLimit-Limit` | Compatibility client'ları için aylık istek limiti |
| `X-RateLimit-Remaining` | Negatif olmayan yaklaşık kalan istek |
| `X-RateLimit-Reset` | Saniye cinsinden Unix timestamp olarak reset zamanı |
| `X-RateLimit-Period` | `YYYY-MM` biçiminde billing period anahtarı |
| `Retry-After` | Retry öncesi saniye; aylık kota tükendiğinde döner |

Yapılandırılmış `RateLimit` alanları aktif IETF HTTPAPI draft'ını izler ve RFC olmadan önce değişebilir. Compatibility client'ları `X-RateLimit-*` kullanabilir. Her değeri tavsiye niteliğinde snapshot olarak ele alın: usage counter'ları asenkron toplanır ve mevcut istek henüz görünmeyebilir.

Header'lar kotadan muaf route'larda veya metering store erişilemediğinde bulunmayabilir. Header'ın olmaması sınırsız servis sözü değildir.

## Güncel kullanımı sorgulama

Planlı dashboard veya zamanlanmış kontrol için authenticated current-tenant endpoint'ini kullanın:

```bash
curl --request GET \
  --url "https://api.ctxhub.net/api/tenants/current/limits" \
  --header "Authorization: Bearer ctx_your_token"
```

Yanıt effective plan, limitler ve usage metric'lerini içerir. Request-quota metriğinde güncel kullanım, limit, kalan, yüzde ve limitin sınırsız olup olmadığı bulunur.

Bu endpoint'i her API isteğinden önce çağırmayın. Normal trafikte response header'larını okuyun; dashboard veya alert için usage endpoint'ini düşük sıklıkta poll edin.

## Kota tükenmesini yönetme

Tükenmiş aylık kota `429 RequestLimitExceeded` döner:

```json
{
  "error": "RequestLimitExceeded",
  "message": "Monthly API request limit exceeded. Please upgrade your plan or wait for the next billing cycle.",
  "limit": 100000,
  "usage": 100000,
  "periodKey": "2026-08",
  "resetAt": "2026-09-01T00:00:00.000Z"
}
```

`error` değeri `RequestLimitExceeded` olduğunda:

1. Etkilenen tenant için otomatik retry'ı durdurun.
2. Recovery planlamak için `Retry-After` veya `resetAt` kullanın.
3. Freshness politikanız izin veriyorsa güvenli cached representation sunun.
4. Hata kullanıcıya görünmeden tenant yöneticisini uyarın.
5. Planı gözden geçirin veya trafiği azaltın; kotayı aşmak için token döndürmeyin.

## Bütçe duyarlı entegrasyon

- Published okumaları kısa ve sınırlı TTL ile cache'leyin; webhook ile invalidate edin.
- SSR veya tek render içindeki aynı istekleri deduplicate edin.
- Cache key'e tenant, normalize path/query, locale ve representation version ekleyin.
- Webhook freshness sağlayabiliyorsa polling yapmayın.
- Kalan kotayı %20, %10 ve %5 gibi warning eşiklerinde izleyin.
- Public ve authenticated cache entry'lerini ayırın.

[Cache ve güncellik](./caching.md) ve [Hatalar ve retry](./errors.md) sayfalarını okuyun.
