# Fiyatlandırma ve paketler

ContextHub Cloud abonelikleri **tenant başına** fiyatlanır. Bir tenant genellikle bir
siteyi, ürün yüzeyini veya dil sürümünü temsil eder. Paketler rastgele bir site adedi
vermez; kotalar tenant'lar arasında havuzlanmaz.

Aşağıdaki tutarlar USD cinsinden standart liste fiyatlarıdır. Vergiler, tahsilat para
birimi ve ödenecek son tutar satın alma öncesinde güvenli checkout ekranında gösterilir.
Türkiye'deki müşteriler için kart anında otomatik kur dönüşümü yerine ayrıca yayımlanan
sabit TRY tutarı kullanılabilir.

| Paket | Aylık | Yıllık | Kullanıcı / owner | Depolama | API istek birimi |
| --- | ---: | ---: | --- | ---: | ---: |
| Free | $0 | $0 | 1 kullanıcı / 1 owner; davet kapalı | 500 MB | 1.000 / ay |
| Pro | $12 | $132 | 5 kullanıcı / 2 owner | 3 GB | 50.000 / ay |
| Pro Max | $45 | $450 | Sınırsız kullanıcı / 5 owner | 5 GB | 150.000 / ay |
| Enterprise | Özel teklif | Özel teklif | Sözleşmeli limit | Sözleşmeli limit | Sözleşmeli veya kullanım bazlı limit |

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
  [İptal ve iade politikası](./cancellation-and-refunds.md) incelenmelidir.

Yazılı Enterprise teklifi, satın alma soruları veya faturalandırma desteği için
`support@ctxhub.net` adresine başvurun.
