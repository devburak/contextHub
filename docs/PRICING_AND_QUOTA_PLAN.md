# ContextHub Fiyatlandırma, Abonelik ve Kota Planı

> Durum: uygulamaya alınan ilk sürüm + PAYG önerisi  
> Karar tarihi: 22 Ağustos 2026  
> Para birimi: uluslararası fiyatlar USD, Türkiye fiyatları açıkça yapılandırılmış TRY; otomatik kur dönüşümü yapılmaz.

## 1. Ürün ilkeleri

1. **Abonelik ve plan tenant seviyesindedir.** Her tenant bağımsız olarak Free, Pro, Pro Max veya Enterprise olur. Bir tenant bir siteyi, uygulamayı ya da tek bir dil sürümünü temsil edebilir.
2. **Account yalnızca ödeme kimliğidir.** Provider customer, fatura adresi ve ticari owner Account'a aittir; plan, kota ve kullanım Tenant'a aittir. İlk migration bu nedenle 1 Account : 1 Tenant'tır.
3. **Paketler site veya tenant paketi değildir.** Free/Pro/Pro Max içinde “1 site, 5 site, 15 site” hakkı bulunmaz. Yeni tenant kendi planı ve aboneliğiyle bağımsız değerlendirilir; Account altında tenant toplamak toplu plan hakkı üretmez.
4. **Plan katalogları yalnızca platform admin tarafından değiştirilir.** Tenant owner, Mongo kayıtlarını veya plan slug'ını doğrudan değiştiremez.
5. **Self-service ödeme fatura ülkesine göre sunucu tarafında yönlendirilir.** Türkiye (`TR`) fatura profilleri iyzico, diğer ülkeler Paddle kullanır. Kullanıcı provider seçemez ve Türkiye için iyzico hazır değilse Paddle'a fallback yapılmaz.
6. **Webhook ticari durumun kaynağıdır.** Tarayıcı dönüş URL'si yetki açmaz. İmzalı, idempotent webhook hangi tenant için geldiyse yalnızca o tenant'ın entitlement'ını günceller.
7. **PAYG tahmini ile gerçek tahsilat ayrıdır.** Sabit paket limitinde istek/yazma durdurulur; sürpriz fatura üretilmez. Enterprise owner ekranı depolama ve API kullanımının liste oranlarıyla hesaplanan bilgilendirme amaçlı karşılığını gösterir; bu değer gerçek fatura veya sözleşme türünü açıklamaz.

## 2. Önerilen lansman paketleri

| Tenant paketi | Aylık / tenant | Yıllık / tenant | Kullanıcı | Owner | Depolama | API isteği / ay |
|---|---:|---:|---:|---:|---:|---:|
| Free | $0 | — | 1 | 1 | 500 MB | 1.000 |
| Pro | $12 | $132 | 5 | 2 | 3 GB | 50.000 |
| **Pro Max** | **$45** | **$450** | sınırsız | 5 | 5 GB | 150.000 |
| Enterprise | $250 başlangıç | sözleşme | özel | özel | özel | özel |

Yıllık fiyat önerisi Pro'da yaklaşık bir ay, Pro Max'ta iki ay avantaj sağlar. Hacim paketi Pro Max'tır; “En popüler” rozeti burada kalır. Enterprise'ın `$250` değeri self-service fiyat değil, satış görüşmesindeki başlangıç çıpasıdır.

Bu rakamlar lansman önerisidir. Üretim maliyeti, destek süresi, ödeme komisyonu ve müşteri kazanım maliyeti en az üç aylık gerçek veriyle ölçülmeden kalıcı fiyat kabul edilmemelidir.

## 3. Paket metinleri ve yetenekleri

### Free — “Ürünü keşfet”

Deneme ve düşük trafikli tenant'lar için. Temel içerik modelini kurmak ve entegrasyonu doğrulamak amacıyla tasarlanır.

- Temel içerik, medya, menü ve form araçları
- Tek kullanıcı; kullanıcı daveti kapalı
- Tenant başına başlangıç kotası
- Dokümantasyon ve topluluk desteği
- Limitte otomatik ücret yok; kota dolduğunda ilgili işlem durur

### Pro — “Üretime geç”

Üretimde çalışan bir tenant ve büyüyen içerik ekibi için kontrollü kapasite.

- Rol, yayın akışı ve webhook yönetimi
- Tenant başına 3 GB depolama ve 50.000 aylık API isteği
- E-posta desteği; hedef yanıt süresi 3 iş günü
- Aylık veya yıllık hosted checkout

### Pro Max — “Tenant'ı ölçekle”

Yüksek trafikli veya geniş ekipli tek bir tenant için hacim paketi.

- Sınırsız ekip kullanıcısı; 5 owner
- Daha yüksek trafik ve depolama kapasitesi
- Öncelikli destek; hedef yanıt süresi 1 iş günü
- DPA ve gelişmiş güvenlik değerlendirmesi için uygun başlangıç seviyesi

### Enterprise — “Birlikte tasarla”

Özel kapasite, güvenlik, veri yerleşimi veya hizmet seviyesi isteyen kurumlar için satış destekli sözleşme.

- Sözleşmeye göre tenant trafiği, depolama ve ekip kapasitesi
- SLA, güvenlik incelemesi ve DPA
- Gerekirse manuel faturalandırma ve satın alma siparişi
- Depolama için `$1 / GB-ay`, API için `$0,10 / 1.000 istek` üzerinden bilgilendirme amaçlı canlı kullanım karşılığı
- Gerçek tahsilat PAYG ya da teklifli sabit bedel olabilir; owner API/UI bu iç fatura sınıfını göstermez
- Gerçek PAYG pilotu yalnızca açık harcama tavanıyla

## 4. Kota davranışı

| Metrik | Ölçüm ve kapı | %80 | %90 | %100 |
|---|---|---|---|---|
| Kullanıcı | aktif + bekleyen üyelik; davet ve doğrudan kullanıcı oluşturmadan önce | owner e-posta + panel sinyali | tekrar uyarı | yeni koltuk engellenir |
| Owner | aktif + bekleyen owner üyeliği; rol atamadan önce | owner e-posta + panel sinyali | tekrar uyarı | yeni owner engellenir |
| Depolama | silinmemiş Media boyut toplamı; presign ve gerçek R2 boyutunda tekrar | owner e-posta + panel sinyali | tekrar uyarı | upload engellenir; taşmış obje temizlenir |
| API isteği | kalıcı aylık kullanım + çalışma zamanı sayacı; dönem anahtarı `YYYY-MM` | owner e-posta + panel sinyali | tekrar uyarı | yeni API istekleri 429 |

Free tenant tek kullanıcılıdır. Free planda davet üretme, yeniden gönderme ve bekleyen daveti kabul etme API katmanında kapalıdır; yalnızca arayüzde gizlenmesine güvenilmez.

### Güvenli kullanıcı daveti

- Admin paneli yalnızca e-posta adresi ve tenant rolü alır; davet edilen kişi adına şifre, durum veya profil bilgisi belirlemez.
- Global e-posta varlığı sorgulanmaz ve daveti gönderen tarafa kullanıcının daha önce kayıtlı olup olmadığı açıklanmaz; her iki yol aynı `202 accepted` yanıtını verir.
- Yeni kullanıcı tek kullanımlık bağlantıda adını ve kendi şifresini belirler.
- Mevcut kullanıcı profilini veya şifresini davet bağlantısıyla değiştiremez; doğru kullanıcı oturumuyla yalnızca tenant üyeliğini kabul eder.
- Davet üzerinden rol değiştirilmez. Aktif üyelerin rol değişikliği ayrı ve yetkili mutation üzerinden yapılır.

Uyarılar tenant + metrik + dönem + eşik anahtarıyla tekilleştirilir. Redis/sayaç arızasında istek kotası kontrollü fail-open kalır ve operasyon uyarısı üretir; tenant entitlement'ı ve ödeme kısıtı Mongo kaynağından uygulanır.

### Owner maliyet görünümü

- Tüm paketlerde aktif abonelik bedeli, yoksa katalog/liste bedeli görünür.
- Son faturada dönem, ara toplam, vergi ve toplam gösterilir; provider veya iç fatura türü gösterilmez.
- Enterprise için depolama ve aylık API kullanımının varsayımsal liste karşılığı ayrı satırlarda hesaplanır.
- Enterprise kullanım karşılığı `gerçek fatura`, `ödenecek tutar` veya `PAYG aboneliği` olarak sunulmaz; sözleşme, indirim, vergi ve manuel mutabakat nedeniyle gerçek tutar farklı olabilir.
- İç mutabakat için `BillingInvoice.commercialModel` sabit abonelik, ölçümlü kullanım ve teklifli sözleşmeyi ayırır; alan varsayılan sorgularda seçilmez ve owner serializer'ına dahil edilmez.

### Fatura profili ve ödeme ülkesi

- Owner checkout öncesinde fatura türü, unvan/ad-soyad, fatura e-postası, ülke, adres ve doğruluk beyanını kaydeder.
- Türkiye profillerinde ayrıca yetkili adı/soyadı, telefon, VKN/TCKN ve kurumsal profilde vergi dairesi zorunludur.
- Vergi numarası AES-256-GCM ile uygulama seviyesinde şifrelenir; legacy düz metin alanı ilk profil güncellemesinde temizlenir. Owner API'sinde açık değer geri dönmez, yalnız maskeli son dört hane ve kayıtlı olup olmadığı gösterilir.
- Server `country=TR` için yalnız iyzico/TRY, diğer ülkeler için Paddle fiyatlarını listeler. Owner API'si provider içeren fiyat anahtarını döndürmez; public fiyat ID'si istemciden değiştirilse bile checkout aynı server-side ülke kontrolünü tekrar yapar.
- Aktif, trial, past-due veya paused abonelik ya da açık/past-due fatura varken ülke/provider değişimi otomatik yapılmaz; kontrollü migration gerekir.
- Kart bilgileri ContextHub tarafından alınmaz veya saklanmaz. iyzico aboneliği kredi kartıyla, diğer ülkelerdeki uygun yöntemler hosted checkout tarafından belirlenir.

## 5. Abonelik yaşam döngüsü

### Satın alma

1. Owner fatura profilini ve doğruluk beyanını tamamlar, ardından aylık/yıllık sabit fiyat seçer.
2. API aktif abonelik bulunmadığını, fatura profilinin tam olduğunu ve seçilen fiyatın server tarafından belirlenen ülke/provider ile eşleştiğini doğrular.
3. Uluslararası profilde Paddle transaction custom data'sına `account_id`, `tenant_id` ve `plan_price_id` yazılır. Türkiye profilinde iyzico abonelik checkout formu fatura adresiyle initialize edilir; checkout token'ının yalnız SHA-256 özeti kısa ömürlü oturumda saklanır.
4. Başarılı tarayıcı dönüşü tek başına yetki vermez.
5. Paddle imzası veya iyzico `X-IYZ-SIGNATURE-V3` imzası doğrulanır, event tekilleştirilir ve yalnızca ilgili Tenant planı güncellenir.

### Fatura ve portal

- Fatura geçmişi webhook'tan oluşturulan salt-okunur kayıtlardır.
- Paddle ödeme yöntemi/iptal işlemleri geçici customer portal URL'siyle; iyzico kart değişikliği ayrı güvenli kart güncelleme formuyla açılır.
- Portal URL'si saklanmaz ve uygulamaya gömülmez.

### İptal ve downgrade

- “Dönem sonunda iptal” aktif entitlement'ı `currentPeriodEnd` tarihine kadar korur.
- Provider `subscription.canceled` olayı geldiğinde ilgili Tenant Free plana alınır ve yalnızca o tenant'ın cache/edge yetkileri yenilenir.
- Aktif abonelikte plan değişikliği uygulama API'sinden yapılmaz; portal kullanılır. Gelecekte provider'ın zamanlanmış değişiklik olayı `scheduledPlanPriceId` alanına yansıtılmalıdır.

### Ödeme başarısızlığı

1. `past_due` olayında abonelik işaretlenir ve varsayılan **7 günlük grace period** başlar.
2. Grace boyunca servis ve yazma erişimi sürer; owner portal üzerinden ödeme yöntemini düzeltebilir.
3. Grace sonunda yalnızca ilgili Tenant aboneliği ödeme kısıtına girer. Okuma ve faturalandırma ekranı açık kalır, o tenant'ın yönetim/API yazmaları HTTP 402 ile durur.
4. Grace sonrasındaki varsayılan **14 günlük tahsilat penceresi** de biterse abonelik `expired`, entitlement Free olur. Veriler otomatik silinmez.
5. Yeniden etkinleşme webhook'u ilgili Tenant aboneliğini yeniden aktif yapar ve tenant planını anında geri açar; aynı ödeme kimliğine bağlı başka tenant'ların durumu değiştirilmez.

## 6. Güvenlik ve operasyon sözleşmesi

- `POST /tenants` plan kabul etmez; oluşturulan ilk self-service tenant daima Free başlar. İstek gövdesine eklenen `plan` alanı şema tarafından reddedilir.
- Public kayıt (`POST /auth/register`) tenant oluşturamaz. Tenant provisioning yalnız e-postası doğrulanmış oturumdan yapılır.
- Lansman sınırı olarak bir kullanıcı yalnız bir public self-service tenant bootstrap edebilir. Bu bir paket/site kotası değildir; tekrar çağrılar servis kontrolüne ek olarak veritabanındaki unique partial index ile de reddedilir. Yeni tenantlar ileride checkout/Enterprise sözleşme provisioning akışından açılır.
- Platform custom-limit endpoint'i plan değiştiremez. Ücretli plan entitlement'ı yalnız imzalı provider sonucu veya doğrulanmış Enterprise sözleşmesiyle uygulanır.
- Pro/Pro Max aktivasyonu için sürümlü hizmet sözleşmesi, tamamlanmış fatura beyanı, provider tarafından doğrulanmış ödeme bilgisi ve aynı plana ait `active`/`trialing` abonelik birlikte aranır.
- Enterprise aktivasyonu için hizmet sözleşmesi, fatura profili güvencesi ve `enterprise_contract` ödeme statüsü aranır. Mevcut Enterprise tenantlar adres/vergi verisi uydurulmadan `legacy_enterprise` güvencesiyle backfill edilir.
- Tenant owner billing verisini görüntüler; checkout/portal başlatabilir fakat provider sonucunu taklit ederek plan açamaz.
- Paddle imzası ham request body üzerinde HMAC-SHA256 ve zaman toleransıyla; iyzico abonelik bildirimi güncel `X-IYZ-SIGNATURE-V3` alan sırasıyla HMAC-SHA256 üzerinden doğrulanır.
- Webhook alımı hızlı `202` döner; işleme asenkrondur. Event kaydı tekrar teslimatı ve yeniden işlemeyi güvenli yapar.
- Eski event yeni abonelik durumunu ezemez; `occurred_at` sıralaması tutulur.
- Cloudflare Edge Gateway `/api/billing/webhooks/*` rotasını origin-managed geçirir; origin secret Worker tarafından eklenir.
- `ACCOUNT_BILLING_ENABLED=false` varsayılandır. Backfill dry-run, örneklem kontrolü, tüm tenant backfill'i ve shadow doğrulama tamamlanmadan açılmaz.

### Rollout

```text
1. Paddle USD price ID'lerini; iyzico TRY plan referanslarını ve kuruş cinsinden tutarları environment üzerinden seed et
2. node apps/api/src/scripts/backfillTenantAccounts.js
3. Dry-run çıktısında owner/slug eşleşmelerini doğrula
4. node apps/api/src/scripts/backfillTenantAccounts.js --apply
5. node apps/api/src/scripts/backfillEnterpriseCommercialAssurance.js
6. Dry-run Enterprise listesini sözleşmeli müşteri listesiyle karşılaştır
7. node apps/api/src/scripts/backfillEnterpriseCommercialAssurance.js --apply
8. ACCOUNT_BILLING_ENABLED=true ile staging shadow doğrulaması
9. Paddle ve iyzico sandbox checkout + ödeme yöntemi + duplicate/out-of-order webhook testi
10. Önce Paddle, ardından ayrı feature/config kapısıyla iyzico düşük hacimli production açılışı
```

## 7. PAYG ve aşım faturalandırması — sonraki faz önerisi

### Öneri: kontrolsüz PAYG değil, tavanlı aşım

İlk self-service model saf kullandıkça öde olmamalıdır. Sabit paketin dahil kotası korunmalı; müşteri açıkça **aşım açma**, bir **aylık harcama tavanı** seçme ve tahmini faturayı görme adımlarını tamamladıktan sonra aşım çalışmalıdır.

Başlangıç fiyat hipotezi:

| Aşım | Pro | Pro Max | Enterprise |
|---|---:|---:|---:|
| API | $2 / ek 10.000 istek | $0,50 / ek 10.000 istek | sözleşme |
| Depolama | $0,50 / GB-ay | $0,40 / GB-ay | sözleşme |

Bu değerler **fiyat kararı değil deney hipotezidir**. En azından R2 depolama/operasyon, Worker/Origin CPU, veritabanı okuma-yazma, destek ve provider komisyonu ölçülerek %70+ brüt marj hedefiyle tekrar hesaplanmalıdır.

### PAYG için zorunlu teknik temel

- Append-only `UsageLedger`: tenant, account, metrik, miktar, kaynak event ve idempotency anahtarı.
- Kapanabilir `BillingUsagePeriod`: dönem durumu (`open`, `closing`, `closed`, `invoiced`), dahil kota, aşım, fiyat ve mutabakat sonucu.
- Redis yalnızca hızlı sayaçtır; fatura Mongo'daki kalıcı ve mutabakatı tamamlanmış kayıttan çıkar.
- Geç gelen event ve saat dilimi için UTC dönem sınırları; kapanıştan sonra düzeltme kaydı, geçmişi yerinde değiştirmeme.
- Provider'a kullanım gönderiminde idempotency key ve dış referans.
- Panelde canlı tahmin, son güncelleme zamanı, eşik bildirimleri ve hard spending cap.
- Negatif/olağan dışı kullanım, sayaç sıçraması ve iki ölçüm hattı farkı için otomatik hold.
- İtiraz ve kredi notu akışı; ham event kanıtı için tanımlı saklama süresi.

### PAYG rollout sırası

1. **Shadow metering:** ücret üretmeden bir tam dönem gerçek kullanım ve maliyet ölçümü.
2. **Enterprise pilot:** manuel mutabakat ve sözleşmeli tavan.
3. **Pro Max opt-in:** düşük varsayılan tavan, günlük tahmin ve %80/%90/%100 harcama uyarıları.
4. **Self-service:** iki başarılı kapanış/mutabakat dönemi ve destek süreci doğrulandıktan sonra.

PAYG hazır değilken %100 kota davranışı sabit paket için bloklamadır. Bu ayrım fiyat sayfasında ve checkout öncesinde açıkça yazılmalıdır.

## 8. Lansman kabul kriterleri

- Tenant owner hiçbir doğrudan API çağrısıyla plan katalogu veya Tenant planını değiştiremez.
- Account üzerinde plan, kota veya “kaç tenant/site hakkı” tutulmaz; bunların tek kaynağı Tenant ve tenant'a bağlı BillingSubscription'dır.
- Backfill tekrar çalıştırılabilir ve tenant başına tek Account/BillingAccount üretir.
- Aylık/yıllık Pro ve Pro Max checkout referansları environment üzerinden doğrulanır; TRY fiyatı eksikse iyzico kaydı seed edilmez ve TR checkout Paddle'a düşmez.
- Aynı webhook iki kez işlendiğinde tek BillingEvent, tek abonelik ve tek fatura oluşur.
- Eski webhook yeni abonelik durumunu geri alamaz.
- Kullanıcı/owner/depolama/istek limitleri gerçek mutation ve hot path'lerde uygulanır.
- %80/%90/%100 uyarıları aynı dönem için birer kez oluşur.
- Past-due grace, write restriction, Free'ye düşme ve yeniden etkinleşme test edilir.
- Owner ekranında loading, empty, error, offline ve yetkisiz durumları güvenli davranır.
