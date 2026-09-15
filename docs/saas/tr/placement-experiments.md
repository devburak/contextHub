# Placement experience ve A/B testleri

Experience'lar placement'ı deney yapılabilen bir sunum yüzeyine dönüştürür. Render payload, uygunluk kuralları, priority, weight, trigger, schedule ve frequency politikasını içerir.

## Experience tanımlama

Authenticated placement yönetimi ekleme, güncelleme ve silme işlemleri sağlar:

```text
POST   https://api.ctxhub.net/api/placements/:id/experiences
PUT    https://api.ctxhub.net/api/placements/:id/experiences/:experienceId
DELETE https://api.ctxhub.net/api/placements/:id/experiences/:experienceId
```

Her experience'a metin değişse de korunacak kararlı bir ad verin. Her deneyde tek değişkeni sınayın; audience ve creative aynı anda değişirse sonucu hangisinin etkilediği anlaşılamaz.

Trigger seçenekleri `onLoad`, `afterDelay`, `onScroll`, `onExit`, `onClick`, `onIdle`, `onHover`, `onTimeout` ve `manual`'dır. Dönen trigger'ı tutarlı uygulamak frontend'in sorumluluğudur.

## A/B test kurma

1. Tek placement altında iki veya daha fazla aktif experience oluşturun.
2. Aynı seçim grubuna girmeleri için aynı priority değerini verin.
3. Eşit dağılım için `1` ve `1` gibi göreceli weight değerleri ayarlayın.
4. Test değişkeni değilse eligibility ve frequency politikalarını aynı tutun.
5. Canlı trafik öncesi impression ve conversion event'lerini doğrulayın.
6. Normal trafik döngülerini kapsayacak kadar çalıştırın; yalnız olumlu sonuç görüldüğü anda durdurmayın.

Karar motoru deterministik kullanıcı bucketing'i değil, ağırlıklı dağılım yapar. Ziyaretçinin journey boyunca aynı varyantta kalması gerekiyorsa seçilen experience'ı uygulamanızda saklayın.

## Sonuçları okuma

```text
GET https://api.ctxhub.net/api/placements/:id/ab-test
GET https://api.ctxhub.net/api/placements/:id/experiences/:expId/funnel
```

A/B raporu experience sonuçlarını karşılaştırır. Funnel endpoint'i tek experience için kaydedilmiş adımların dizisini gösterir. Conversion rate'i sample size, event kalitesi, schedule, eligibility kuralları ve frequency cap ile birlikte yorumlayın.

## Kazananı yayınlama

Açık bir yayın değişikliği yapın: kazananın priority veya weight değerini artırın, uygun olduğunda kaybeden experience'ları archive edin ve ilk ölçüm aralığını kendi deney notlarınızda saklayın. Sonraki kampanyada temiz bir raporlama kimliği gerekiyorsa placement'ı duplicate edin.

[Event ve analitik](./placement-events.md) ile devam edin.
