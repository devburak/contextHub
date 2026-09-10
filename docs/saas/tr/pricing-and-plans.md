# Fiyatlandırma ve paketler

ContextHub Cloud abonelikleri **tenant başına** fiyatlanır. Bir tenant genellikle bir
siteyi, ürün yüzeyini veya dil sürümünü temsil eder. Paketler rastgele bir site adedi
vermez; kotalar tenant'lar arasında havuzlanmaz.

Türkiye fatura adreslerinde tahsilat, aşağıda yayımlanan sabit TRY paket bedeli
üzerinden yapılır. Fiyatlara KDV dahildir; dönem, yenileme ve ödenecek toplam tutar
satın alma öncesinde güvenli ödeme ekranında tekrar gösterilir.

| Paket | Aylık | Yıllık | Kullanıcı / owner | Depolama | API istek birimi | Satın alma |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| Free | ₺0 | ₺0 | 1 kullanıcı / 1 owner; davet kapalı | 500 MB | 1.000 / ay | [Ücretsiz başla](/signup?returnTo=%2Fvarliklar%2Fyeni%3Fplan%3Dfree%26interval%3Dmonth) |
| Pro | ₺499\* | ₺4.990\* | 5 kullanıcı / 2 owner | 3 GB | 50.000 / ay | [Paketi seç](/login?returnTo=%2Ffaturalandirma%3Fplan%3Dpro%26interval%3Dmonth) |
| Pro Max | ₺1.499\* | ₺14.990\* | Sınırsız kullanıcı / 5 owner | 5 GB | 150.000 / ay | [Paketi seç](/login?returnTo=%2Ffaturalandirma%3Fplan%3Dpromax%26interval%3Dmonth) |
| Enterprise | Özel teklif | Özel teklif | Sözleşmeli limit | Sözleşmeli limit | Sözleşmeli veya kullanım bazlı limit | [Teklif iste](mailto:support@ctxhub.net?subject=ContextHub%20Enterprise%20teklifi) |

\* TRY liste fiyatları USD liste fiyatı ve piyasa koşulları dikkate alınarak **belirli
dönemlerde gözden geçirilir**. Kart anında kur çevrimi yapılmaz; ödeme ekranında gösterilen
TRY tutarı ilgili tahsilat için sabittir. Fiyat değişiklikleri yeni satın almalarda
uygulanır. Mevcut abonelik yenilemeleri yürürlükteki sözleşme ve önceden bilgilendirme
koşullarına tabidir.

Yıllık fiyatlar yıllık dönem için tek seferde tahsil edilir. Enterprise ücretsiz bir
paket değildir ve self-service checkout üzerinden satılmaz; bedel, hizmet seviyesi,
kota ve varsa kullanıma dayalı koşullar imzalı teklif veya sözleşmede belirlenir.

## Dahil olan yetenekler

| Yetenek | Free | Pro | Pro Max | Enterprise |
| --- | --- | --- | --- | --- |
| Tenant kapsamlı içerik, collections, medya, menü, form, rol ve API sunumu | Dahil | Dahil | Dahil | Dahil |
| Kullanıcı daveti | Yok | Paket limitine kadar | Paket limitine kadar | Sözleşme limiti |
| Semantic Search ve benzer içerik yönetimi | — | Dahil | Dahil | Dahil veya sözleşmeye göre |
| Yönetilen tenant yedekleme yeteneği | — | Dahil | Dahil | Dahil veya sözleşmeye göre |
| Öncelikli/ticari destek ve müzakere edilmiş hizmet seviyeleri | — | — | — | Sözleşmeye göre |

Semantic Search tüm ücretli aboneliklerin entitlement'ıdır; ayrı bir site hakkı
oluşturmaz. Sorgular, faturalandırma ekranında ve ilgili paket koşullarında açıklandığı
şekilde ağırlıklı istek birimi tüketebilir.

## Satın alma ve yenileme

- Faturalandırma ekranı checkout öncesinde seçilen tenant'ı, dönemi, para birimini,
  vergi yaklaşımını, yenileme tarihini ve tahsilatı yapan tarafı gösterir.
- Ücretli paket yalnız doğrulanmış provider olayı veya yetkili Enterprise provisioning
  kaydı sonrasında etkinleşir. Tenant oluşturma isteği doğrudan ücretli paket seçemez.
- Enterprise sözleşmesi açıkça etkinleştirmedikçe sabit paketlerde otomatik PAYG veya
  aşım tahsilatı oluşmaz.
- Satın alma öncesinde [Hizmet ve abonelik koşulları](./terms-of-service.md),
  [Gizlilik aydınlatması](./privacy-notice.md) ve
  [Teslimat, iptal ve iade şartları](./cancellation-and-refunds.md) ile tüketici işlemlerinde
  [Mesafeli satış sözleşmesi](./distance-sales-agreement.md) incelenmelidir.

Yazılı Enterprise teklifi, satın alma soruları veya faturalandırma desteği için
`support@ctxhub.net` adresine başvurun.
