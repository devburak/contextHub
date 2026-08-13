# Webhook ve invalidation

ContextHub Cloud webhook'ları tenant içeriği değiştiğinde backend'inizi bilgilendirir. Cache, search index, feed ve diğer türetilmiş verileri yenilemek için kullanın.

## Receiver sırası

1. Raw request body'yi okuyun.
2. Webhook secret ile signature'ı timing-safe karşılaştırmayla doğrulayın.
3. Replay penceresinin dışındaki timestamp'leri reddedin.
4. Event ID'yi durable storage'da deduplicate edin.
5. İşi durable queue'ya alın.
6. Hızlıca success dönün ve invalidation'ı async işleyin.

## Idempotency ve retry

Delivery at-least-once'dır. Aynı event'i iki kez işlemek güvenli olmalıdır. Yalnızca durable kabul sonrası `2xx`, kalıcı geçersiz isteklerde `4xx`, geçici hatalarda `5xx` dönün. Sınırlandırılmış exponential backoff ve dead-letter queue kullanın.

## Cache invalidation

- Publish/update: ID, slug, ilgili liste, search ve bağımlı sayfaları temizleyin.
- Unpublish/delete: eski slug ve türetilmiş search kayıtlarını da kaldırın.
- Slug değişikliği: eski ve yeni slug'ı temizleyin.
- Collection update: entry, collection listesi ve bağımlı görünümleri temizleyin.
- Menu/placement update: kararlı resource key'ini temizleyin.

Webhook secret'ları secret manager'da bulunmalıdır. Rotate edin, loglardan çıkarın ve signature debug bilgisini unauthenticated kullanıcıya açmayın.

Webhook yönetim UI'ı ve delivery operasyonları yönetilen ContextHub Cloud admin deneyiminin parçasıdır.
