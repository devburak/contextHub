# ContextHub Edge Gateway

Bu kılavuzdaki bütün production API örnekleri `https://api.ctxhub.net` kullanır. İstekler tenant kapsamlı servislere ulaşmadan önce yönetilen ContextHub Edge Gateway'e girer.

## Gateway ne yapar

- Özellikle public `/api/public/*` route'larıyla authenticated private route'ları sınıflandırır.
- Public isteklerde tenant yapılandırmasını çözer.
- Tenant'a özel browser CORS politikasını uygular.
- API token ve tenant tutarlılığını edge sınırında doğrular.
- Yönetilen rate-limit ve abuse kontrolleri uygular.
- Origin'i korur; müşteriler origin hostname ile doğrudan entegrasyon kurmaz.
- İzleme ve destek için operasyonel request context taşır.

Gateway işletilen bir `ctxhub.net` servisidir. Deployment kodu, provider yapılandırması, secret'ları ve origin kontrolleri community repo müşteri özelliği değildir.

## Müşteri sorumlulukları

1. Production'da yalnızca `https://api.ctxhub.net/api/...` çağırın.
2. Her browser origin'ini tenant allowed-origin ayarlarına ekleyin.
3. Gerekliyse apex ve wildcard subdomain'i ayrı ayrı ekleyin.
4. API token'ları güvenilir sunucularda tutun.
5. `X-Tenant-ID` header'ını yalnızca belgelenmiş public sunum isteklerinde gönderin.
6. `429` cevaplarına ve retry bilgisine uyun.
7. Destek taleplerinde ContextHub request ID kullanın; token eklemeyin.

## Public ve private path'ler

İnteraktif OpenAPI referansı `https://api.ctxhub.net/api/docs` adresinde sunulur. `/api/docs` ailesi explicit bypass path'tir; böylece Swagger asset'leri ve JSON/YAML sözleşmeleri tenant token olmadan yüklenebilir. `https://api.ctxhub.net/docs` desteklenen public path değildir.

```text
/api/public/*  -> public sunum politikası + tenant kimliği
diğer /api/*   -> authenticated API veya admin politikası
```

Normal public okumalara `ctx_...` token eklemeyin. Private içeriği public route üzerinden proxy etmeyin. CORS browser permission sınırıdır, authentication değildir.

## Development origin'leri

Localhost erişimi tenant bazında kontrol edilir. Local development kapalıysa gateway'i bypass etmek veya browser güvenliğini kapatmak yerine onaylı development domain kullanın.
