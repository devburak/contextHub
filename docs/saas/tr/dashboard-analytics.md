# Dashboard ve API analytics

Ajanslar admin UI'ı scrape etmek yerine ContextHub'ın authenticated summary endpoint'lerinden tenant dashboard'ları oluşturabilir.

```text
GET https://api.ctxhub.net/api/dashboard/summary
GET https://api.ctxhub.net/api/dashboard/activities
GET https://api.ctxhub.net/api/dashboard/api-stats
```

## Özet

`/dashboard/summary`; kullanıcı, content ve media toplamlarıyla aggregate media boyutunu döndürür. Overview kartları ve kapasite sinyalleri için kullanın, billing mutabakatı için değil.

## Son editoryal hareketler

`/dashboard/activities`, mevcut content, media ve form kayıtlarını son create/update hareketi şeklinde sıralar. Type, scope, limit ve offset kontrollerini kabul eder. Owner tenant-wide scope isteyebilir; diğer kullanıcılar self scope ile sınırlanır.

Bu feed mevcut kayıtlardan türetilir ve kalıcı [security activity log'dan](./audit-activity.md) farklıdır.

## API kullanım istatistikleri

`/dashboard/api-stats`; veri toplamanın aktifliği ile four-hour, daily, today, weekly ve monthly görünümleri döndürür. Uygulanan request sınırları için [quota header ve kullanımı](./quotas.md) kullanın; dashboard istatistikleri operasyonel bir görünümdür.

Dashboard cevaplarını kısa süre cache'leyin, son yenilenme zamanını gösterin ve farklı zaman aralıklarının yanlış karşılaştırılmaması için period sınırlarını kendi metric'inizde koruyun.
