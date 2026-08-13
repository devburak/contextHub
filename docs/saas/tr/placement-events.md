# Placement event ve analitik

Ziyaretçinin gerçekten ne gördüğünü ve yaptığını kaydedin. Karar sonucu impression değildir; seçildiği halde görünür olmayan experience performansı yükseltmemelidir.

## Event toplama

Tarayıcı sunumu private token değil tenant kimliği kullanır:

```text
POST https://api.ctxhub.net/api/public/placements/event
POST https://api.ctxhub.net/api/public/placements/events/batch
X-Tenant-ID: your-tenant-id
```

Batch endpoint en fazla 100 event kabul eder. Desteklenen event tipleri `impression`, `view`, `click`, `close`, `dismiss`, `submit`, `conversion` ve `error`'dır.

```js
await fetch('https://api.ctxhub.net/api/public/placements/event', {
  method: 'POST',
  keepalive: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your-tenant-id',
  },
  body: JSON.stringify({
    placementId,
    experienceId,
    type: 'conversion',
    sessionId,
    path: window.location.pathname,
  }),
})
```

Mümkünse promo SDK transport'unu kullanın. Yüksek hacimli etkileşimleri batch edin, geçici hataları sınırlı retry ile yönetin ve navigasyonu analytics için bekletmeyin.

## Raporlama yüzeyi

Authenticated tenant caller'lar şunları sorgulayabilir:

```text
GET /api/placements/:id/stats
GET /api/placements/:id/stats/totals
GET /api/placements/:id/stats/devices
GET /api/placements/:id/stats/browsers
GET /api/placements/:id/stats/top-pages
GET /api/placements/:id/stats/realtime
GET /api/placements/:id/ab-test
GET /api/placements/:id/experiences/:expId/funnel
GET /api/placements/journey
```

Ana stats route'unu toplam ve zaman serileri; breakdown route'larını sunum teşhisi; realtime veriyi operasyon kontrolü; A/B ve funnel route'larını deney sonuçları; journey'yi event dizileri için kullanın.

## Ölçüm pratikleri

- Yayın öncesi conversion event'ini ve sayım kuralını tanımlayın.
- Bir ziyarette karar ve event'lerde aynı kararlı `sessionId` değerini kullanın.
- Seçilen gerçek `experienceId` değerini gönderin; render metninden tahmin etmeyin.
- Path ve keyfi metadata içinde kişisel veri tutmayın.
- Event hatalarını decision hatalarından ayrı izleyin.
- Ani oran değişimlerini deploy, kural düzenleme, schedule ve bot trafiğiyle birlikte inceleyin.

Public event toplama rate-limit ve tenant sınırına sahiptir; yine de istemci güvenilmezdir. Placement analytics'i finansal kayıt veya authorization kaynağı olarak kullanmayın.
