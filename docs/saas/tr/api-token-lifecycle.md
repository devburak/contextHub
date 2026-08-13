# API token yaşam döngüsü

API token'ları güvenilir sunucu entegrasyonlarını doğrular. Token yönetimi yalnız owner'a açıktır ve düz metin `ctx_...` değeri yalnız oluşturma anında döner.

## En az yetkiyle oluşturma

```http
POST https://api.ctxhub.net/api/api-tokens
Authorization: Bearer <owner-session-token>
Content-Type: application/json

{
  "name": "production website reads",
  "role": "viewer",
  "scopes": ["read"],
  "expiresInDays": 90
}
```

Etkin authorization, seçilen rol izinleri ile `read`, `write` ve `delete` token scope'larının kesişimidir. Geniş bir rol, eksik token scope'unu aşamaz.

Dönen token'ı hemen secret manager'a kaydedin. ContextHub SHA-256 hash saklar ve değeri yeniden gösteremez. Token'ı tarayıcı JavaScript'ine, URL'ye, analytics'e, source control'e veya log'a koymayın.

## Envanter ve expiry

`GET /api/api-tokens`; ad, rol, scope, `expiresAt`, `lastUsedAt`, oluşturma zamanı ve oluşturan kullanıcı bilgisini döndürür; secret veya hash dönmez. Kullanım ve revoke işlemi izlenebilir olsun diye her workload'a ayrı token verin.

`expiresInDays: 0` süresiz token oluşturur. Sonlu süre kullanıp sona ermeden alarm üretmeyi tercih edin. Token adı ve scope'ları `PUT /api/api-tokens/:tokenId` ile güncellenebilir; rol ve expiry oluşturma anında sabittir.

## Kesintisiz rotation

Yerinde secret rotation işlemi yoktur:

1. Gerekli rol, scope ve expiry ile yeni token oluşturun.
2. Yeni değeri her tüketiciye kaydedip deploy edin.
3. Başarılı request'leri doğrulayın ve `lastUsedAt` değerini gözleyin.
4. Eski token'ı `DELETE /api/api-tokens/:tokenId` ile revoke edin.

Silmeyi anlık revoke kabul edin. Acil durum için owner oturumunu erişilebilir tutun; bir token'ı revoke etmek için aynı token'a bağımlı olmayın.

API token kabul eden sınırlar için [Kimlik doğrulama ve tenant yapısına](./authentication.md) bakın.
