# Cache ve güncellik

Güvenli ContextHub Cloud okumalarını katmanlı cache'leyin. Amaç tenant sınırını aşmadan veya draft sunmadan gecikme ve API trafiğini azaltmaktır.

## Önerilen sıra

```text
request/render deduplication -> 30–60sn uygulama cache'i -> ContextHub Edge Gateway
```

Birden fazla uygulama instance'ı sonucu paylaşacaksa Redis veya başka bir shared cache kullanın. TTL'i fallback olarak tutun ve hızlı invalidation için doğrulanmış webhook'ları kullanın.

## Cache anahtarı

Temsili değiştiren bütün girdileri ekleyin:

```text
tenant + method + normalize path + normalize query + locale + representation version
```

API token loglanabilir cache key'in parçası olmamalıdır. Authentication sonrasında kararlı tenant namespace üretin.

## Güvenli adaylar

- Published content liste ve slug detay okumaları.
- Public collection liste, detay ve sınırlandırılmış DSL query'leri.
- Menüler ve public form definition'ları.
- Public tenant branding ve kişiselleştirilmemiş placement definition'ları.

## Asla cache'lemeyin

- Mutation ve form submission.
- Admin session, authentication ve CSRF cevapları.
- Preview, draft, scheduled veya permission hassas içerik.
- `Set-Cookie` içeren cevaplar.
- Kişiselleştirilmiş placement decision'ları.
- Sınırlandırılmamış error veya rate-limit cevapları.

## Invalidation

Doğrulanmış webhook'un etkilediği content ID, eski/yeni slug, liste, search, menu, collection ve placement key'lerini temizleyin. Kesin dependency takibi yoksa global cache yerine sınırlı tenant namespace'i purge edin.

`HIT`, `MISS`, `STALE`, `BYPASS`, age ve origin duration kaydedin. Token ve müşteri içeriğini cache diagnostic'lerinden çıkarın.

[Webhook ve invalidation](./webhooks.md) ile devam edin.
