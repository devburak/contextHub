# Kimlik doğrulama ve tenant yapısı

ContextHub Cloud üç güven sınırı kullanır. İşlem için yeterli olan en dar sınırı seçin.

## Güvenilir sunucular için API token

Backend, build servisi, migration veya başka bir güvenilir runtime'dan şu header'ı gönderin:

```http
Authorization: Bearer ctx_your_token
```

Token kendi tenant'ını seçer; rol ve scope taşır. `GET`, `HEAD`, `OPTIONS` geçerli token ister; mutation'lar uygun `write` veya `delete` scope ister. Token'ları secret manager'da saklayın ve rotate edin.

## Tarayıcılar için public sunum

Özellikle public olarak tasarlanan `/api/public/*` route'ları şu header'ı kullanır:

```http
X-Tenant-ID: your-tenant-id
```

Belgelenen `tenantId` query parametresi de kabul edilir. Normal public okumalara `ctx_...` token eklemeyin; ContextHub Edge Gateway public path üzerindeki API token'ı reddeder. Public form submit bunun istisnasıdır ve write-scope token ister. Token'ı gizli tutmak için submission'ı güvenilir sunucunuzdan proxy edin.

## Admin oturumları

ContextHub Cloud admin; HttpOnly session cookie, CSRF koruması, tenant membership, rol ve permission kullanır. Müşteri entegrasyonları admin login akışını taklit etmemeli; otomasyon için API token kullanmalıdır.

## Tenant kuralları

- Authenticated tenant context otoritedir.
- Request body tenant değiştiremez.
- Referans verilen medya, content ve collection entry aynı tenant'a ait olmalıdır.
- Public collection okumaları yalnızca published entry döndürür.
- Public site için content okumalarında `status=published` açıkça istenmelidir.
- API-token content cevapları yalnızca tanımı public olan custom field'ları gösterir.

## Sık karşılaşılan cevaplar

- `401`: kimlik bilgisi eksik, geçersiz veya süresi dolmuş.
- `403`: kimlik biliniyor fakat scope, rol, permission, entitlement veya edge policy yetersiz.
- `404`: kaynak yok veya sınır ötesinde bilinçli olarak gizleniyor.
- `429`: backoff uygulayın ve retry bilgisini izleyin.

Tenant çözümlemesi başarısız olduğunda varsayılan tenant'a düşmeyin.
