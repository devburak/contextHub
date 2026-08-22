# ContextHub Cloud genel bakış

Bu kılavuz `ctxhub.net` üzerindeki yönetilen ContextHub SaaS hizmetini kullanan müşteriler içindir. ContextHub Cloud tarafından işletilen API'yi, tenant sınırını, içerik sunum yöntemlerini ve yönetilen yetenekleri açıklar. Burada anlatılan her servisin community repoda bulunduğu anlamına gelmez.

ContextHub Cloud, **İKONX Bilişim ve Tarım Sanayi ve Ticaret Ltd. Şti.** tarafından işletilir. `ctxhub.net`, kurumsal alan adı `ikon-x.com.tr`, abonelik koşulları, gizlilik ve tahsilat rolleri arasındaki ilişki için [Hukuki hizmet ve merchant kimliği](./legal-merchant-identity.md) sayfasını inceleyin.

## Hizmet sınırı

ContextHub Cloud, temel içerik platformunu işletilen altyapı ve ticari servislerle birleştirir.

| Alan | ContextHub Cloud sorumluluğu |
| --- | --- |
| İçerik platformu | Tenant güvenli content, collections, medya, galeri, menü, form, rol ve admin akışları |
| Kişiselleştirme | Placement kararları, hedefleme kuralları, ağırlıklı experience'lar, A/B test raporları, funnel, realtime analytics ve journey |
| API edge | `https://api.ctxhub.net` yönlendirmesi, tenant CORS, origin koruması ve public/private route politikası |
| Yönetilen sunum | API işletimi, medya sunumu, izleme, güncelleme ve destek |
| Yönetilen yetenekler | Semantic Search ve ticari pluginler gibi plana bağlı servisler |

Public repo open-core platformu ve extension sözleşmelerini içerir. `ctxhub.net` hizmeti ayrıca community repo özelliği olarak sunulmayan işletilen altyapı, private companion'lar, yapılandırma ve ticari yetenekleri içerir.

## Entegrasyon modeli

```text
Tarayıcınız veya sunucunuz
        |
        v
https://api.ctxhub.net
  ContextHub Edge Gateway
        |
        v
Tenant kapsamlı ContextHub Cloud servisleri
```

Content, medya, şema ve yönetim okumaları için sunucu tarafında `ctx_...` API token kullanın. Tarayıcı sunumu için özellikle public olarak tasarlanan `/api/public/*` route'larında `X-Tenant-ID` kullanın. API token'ı tarayıcı JavaScript'ine koymayın.

## Doğru kaynağı seçin

- **Content:** sayfa, yazı, duyuru ve yeniden kullanılabilir editoryal kayıtlar.
- **Collections:** konum, kişi, ürün, etkinlik veya SSS gibi tipli ve tekrarlanabilir veriler.
- **Medya:** yüklenen dosyalar, görsel varyantları, erişilebilirlik bilgisi ve harici videolar.
- **Menüler:** navigasyon ağaçları.
- **Formlar:** input şemaları ve kullanıcı yanıtları.
- **Placements:** kural tabanlı karar, ağırlıklı experience, frequency kontrolü, event toplama, A/B test, funnel ve journey içeren kişiselleştirme ve deney yüzeyleri.

## ContextHub Cloud'u ayrıştıran alanlar

- Multi-tenant membership ve custom roller ajans/müşteri ayrımını tek control plane'de destekler.
- Form ve galeriler generic entry içine sıkıştırılmış field'lar değil, first-class yönetilen kaynaklardır.
- Placements ayrı bir optimizasyon ürünü gerektirmeden kişiselleştirme, deney ve analytics'i birleştirir.
- Public Plugin API, güvenilir extension'ların core'u fork etmeden API, consumer, settings, entitlement ve admin yüzeyi eklemesini sağlar.
- Dashboard, activity, token ve feature flag API'leri ajansların kendi operasyon akışlarını kurmasına izin verir.

## Önerilen canlı ortam akışı

1. Tenant'ı oluşturun ve tarayıcı origin'lerini ContextHub Cloud'da tanımlayın.
2. Sunucu entegrasyonu için en az yetkili ve süreli API token oluşturun.
3. Editoryal bilgiyi Content, yapılandırılmış kayıtları Collections ile modelleyin.
4. Güvenli okumalar için 30–60 saniyelik uygulama cache'i ekleyin.
5. Doğrulanmış webhook'larla ilgili cache anahtarlarını temizleyin.
6. Tenant rolleri, audit export ve token rotation'ı operasyon kontrol listesine ekleyin.
7. Plana bağlı yetenekleri geliştirmeden önce ContextHub ile teyit edin.

[Hızlı başlangıç](./quickstart.md), [Placements ve kişiselleştirme](./placements.md) ve [Roller ve izinler](./roles-permissions.md) ile devam edin.
