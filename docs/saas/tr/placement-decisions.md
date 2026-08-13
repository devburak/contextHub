# Placement karar motoru ve hedefleme

Public decision API, tenant'a ait placement kurallarını açıkça gönderilen request context'ine göre değerlendirir. Private API token istemez ve kabul etmez.

## Tek placement için karar

```text
POST https://api.ctxhub.net/api/public/placements/decide
POST https://api.ctxhub.net/api/public/placements/decide-batch
```

```js
const response = await fetch('https://api.ctxhub.net/api/public/placements/decide', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Tenant-ID': 'your-tenant-id',
  },
  body: JSON.stringify({
    placement: 'homepage-hero',
    context: {
      path: '/',
      sessionId: 'session-8e5d',
      locale: 'tr',
      device: 'desktop',
      browser: 'chrome',
      authenticated: false,
      userTags: ['newsletter-subscriber'],
      featureFlags: ['new-home'],
    },
  }),
})
```

`placement`, `context.path` ve `context.sessionId` zorunludur. Opsiyonel context; locale, cihaz, tarayıcı, işletim sistemi, authentication durumu, roller, user tag'leri, feature flag'ler, query parametreleri, cookie'ler, referrer, user key ve daha önce görülmüş frequency sayaçlarını içerir.

Sayfada birkaç karar gerekiyorsa `POST /api/public/placements/decide-batch` kullanın. Böylece her sonuç bağımsız değerlendirilirken network maliyeti azalır.

## Kural modeli

Kurallar path ve path mode, query değerleri, locale, cihaz, tarayıcı, işletim sistemi, authentication durumu, roller, user tag'leri, zorunlu veya hariç feature flag'ler, cookie ve referrer eşleştirebilir. Experience'larda exclusion kuralları ve aktif zaman aralıkları da olabilir.

Yalnız işlemeye yetkili olduğunuz context'i gönderin. Tag, cookie, `userKey` ve analytics metadata içinde ham kişisel veri kullanmayın.

## Seçim sırası

ContextHub Cloud:

1. pasif, zaman aralığı dışında, hariç tutulan, frequency cap'e takılan veya kuralla eşleşmeyen experience'ları çıkarır;
2. kalan adayların en yüksek priority değerini bulur;
3. ağırlıklı seçimi yalnız bu priority grubunda yapar;
4. uygun aday yoksa tanımlı fallback'i döndürür.

Weight değerleri yüzde değil, görecelidir. `1` ve `3` ağırlıklı iki aday yeterli trafikte yaklaşık %25 ve %75 dağılım alır.

## Frequency cap

Bir experience session, gün, hafta, ay veya toplam gösterim sınırları tanımlayabilir ve conversion sonrası sıfırlanabilir. Mevcut public evaluator session, day ve total kontrollerini istemcinin gönderdiği düz numeric `seenCaps` map'inden uygular. `summer-offer` cap key'i için anahtarlar `summer-offer`, `summer-offer:YYYY-MM-DD` ve `summer-offer:total` olur. Promo SDK dönen frequency politikasından session, daily ve total kontrollerini tarayıcıda uygular; server-side kontrol kullanan doğrudan entegrasyonlar map'i tutarlı biçimde saklayıp göndermelidir.

Frequency kontrolü kullanıcı deneyimini iyileştirir fakat authorization sınırı değildir. İstemci local sayacı değiştirebilir; entitlement veya billing için kullanmayın.

## Güvenli debug

Kimliği doğrulanmış editörler, yayınlamadan önce test context'iyle placement debug işlemini çağırabilir. Authenticated debug route'unu veya cevabını tarayıcı koduna açmayın.

Sonraki adım: [Experience ve A/B testleri](./placement-experiments.md).
