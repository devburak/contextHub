# Tenant yedekleme ve Google Drive

Tenant yedekleme, bir tenant'ın veritabanı kayıtlarını ve yüklenmiş medya dosyalarını ContextHub Cloud'dan müşterinin kontrol ettiği bir depolamaya kopyalar. Hedef, müşterinin kendi **Google Drive** hesabı veya private bir **S3 uyumlu bucket** olabilir (AWS S3, Cloudflare R2, MinIO ve uyumlu servisler). Yedekler günlük zamanlamayla veya elle çalışır ve admin üzerinden geri yüklenebilir.

## Kısa bilgiler

| Soru | Cevap |
| --- | --- |
| Hangi paketlerde var? | Pro, Pro Max ve Enterprise. Free pakette yoktur. |
| Yedekler nerede saklanır? | Kendi Google Drive hesabınızda veya kendi private S3 uyumlu bucket'ınızda. |
| Ne yedeklenir? | Tenant veritabanı kayıtları ve yüklenmiş medya dosyaları. Her grup ayrı açılıp kapatılabilir. |
| Ne sıklıkla? | Seçtiğiniz saatte (UTC) günde bir kez; ayrıca istediğiniz an elle. |
| Full mü incremental mı? | İkisi de. Veritabanı ve dosyalar ayrı ayrı `full` veya `incremental` modda çalışır. |
| Kim yapılandırabilir? | Tenant sahibi veya `tenantBackup.configure` iznine sahip kullanıcılar. Çalıştırma ve geri yükleme için ayrıca `tenantBackup.run` gerekir. |
| Geri yükleyebilir miyim? | Evet; admin üzerinden, Google Drive veya S3 kaynağından. |
| Platformun felaket kurtarmasıyla aynı şey mi? | Hayır. Bu, müşteriye ait bir kopyadır; ContextHub Cloud'un kendi operasyonel yedeklerinden ayrıdır. |

## Tenant'ı Google Drive'a nasıl yedeklerim?

1. Admin'de korumak istediğiniz tenant için **Tenant yedekleme** sayfasını açın.
2. Hedef olarak **Google Drive** seçin ve **Google Drive bağla** düğmesini kullanın.
3. Yedeklerin sahibi olacak hesapla Google izin ekranını onaylayın.
4. ContextHub'a döndüğünüzde planı etkinleştirin, nelerin dahil olacağını ve günlük saati seçip kaydedin.
5. **Bağlantıyı test et**, ardından ilk full yedek için **Şimdi yedekle** seçeneğini kullanın.

ContextHub o Google hesabında `ContextHub Backups <tenantId>` adlı bir klasör oluşturur ve tüm yedekleri oraya yazar. Yedekleme sayfasında klasörü Drive'da açan bir bağlantı gösterilir.

## ContextHub Google Drive'ımda neleri görebilir?

ContextHub yalnızca `drive.file` scope'unu ister. Bu scope, uygulamanın oluşturduğu veya uygulamayla açıkça paylaşılan dosyalara erişim sağlar. ContextHub yedekleme akışı kendi yedek dosya ve klasörlerini kullanır. Diğer Drive belgelerinizi listeleyemez, okuyamaz, değiştiremez.

- Her tenant'ın kendi Drive yetkilendirmesi vardır; şifreli saklanır ve API tarafından asla geri döndürülmez.
- Drive bağlamak, [Google ile giriş](./google-sign-in.md) izninden ayrı bir izindir. Google ile giriş yapmak Drive erişimi vermez.
- **Bağlantıyı kaldır** Google yetkilendirmesini iptal eder ve ContextHub'dan siler. Mevcut yedek dosyaları Drive'ınızda kalır.
- Aynı Google hesabını yeniden bağlamak mevcut yedek klasörünü bulur ve oradan devam eder.
- Aynı Google hesabı birden fazla tenant'a bağlıysa bir tenant'ın bağlantısını kaldırmak diğerlerini de geçersiz kılabilir. Bir çalışma yeniden bağlantı gerektiğini bildirirse o tenant'ları yeniden bağlayın.
- Yedekler bağlı Google hesabının depolama kotasından düşer.

## S3 uyumlu depolamaya nasıl yedeklerim?

**S3-compatible storage** seçin; endpoint, bucket, region, prefix ve access key çiftini girin. Bucket private, ayrı ve sizin kontrolünüzde olmalıdır; ContextHub'ın kendi medya depolaması yedek hedefi olarak kullanılamaz. Endpoint HTTPS olmalıdır ve özel ağ adreslerini gösteremez. Kimlik bilgileri şifreli saklanır ve kaydedildikten sonra tekrar gösterilmez. Sağlayıcı destekliyorsa AES256 server-side encryption'ı açık tutun.

## Yedeğe neler dahildir?

- **Veritabanı:** tenant kayıtları, gzip ile sıkıştırılmış NDJSON parçaları olarak yazılır.
- **Dosyalar:** tenant'ın yüklediği medya objeleri, varyantlarıyla birlikte.
- **Manifest ve envanter:** her çalışma SHA-256 checksum'ları içeren bir manifest yazar; böylece yedek geri yüklenmeden önce doğrulanabilir.

`full` mod tüm güncel kayıt ve dosyaları yazar. `incremental` mod güncel durumu son başarılı çalışmayla karşılaştırır ve silmeler dahil yalnızca değişenleri yazar. Yarıda kalan bir çalışma, sonraki incremental çalışmanın başlangıç noktası olarak kullanılmaz.

## Yedekler ne zaman çalışır?

- **Zamanlanmış:** yapılandırılan UTC saatinde günde bir kez.
- **Elle:** **Şimdi yedekle** hemen başlar ve arka planda devam eder; uzun süren ilk yedekte sayfa durumu kendiliğinden yeniler.
- **Hatalar:** başarısız bir zamanlanmış çalışma her zamanlayıcı turunda değil, bir bekleme süresinden sonra tekrar denenir. Elle çalıştırma bu beklemeden etkilenmez.
- **Geçmiş:** admin en yeni 25 çalışmayı mod, kayıt sayısı ve dosya sayısıyla listeler. Loglarda kimlik bilgisi veya dosya içeriği bulunmaz.

Bir tenant için aynı anda yalnızca bir yedekleme veya geri yükleme işlemi çalışır.

## Geri yükleme nasıl çalışır?

Geri yükleme, Tenant yedekleme sayfasındaki **Yedekten içe aktar** ile yapılır.

1. **Kaynak:** bağlı Google Drive hesabı veya kaydedip test ettiğiniz bir S3 kaynağı.
2. **Geri yükleme noktası:** en son başarılı yedeklerden birini seçin.
3. **Kapsam ve doğrulama:** hangi veri gruplarının ve medya dosyalarının geri yükleneceğini seçin. ContextHub; checksum'ları, tenant sınırını ve kimlik çakışmalarını doğrulayan bir dry-run yapar.
4. **Uygulama:** başlatmak için onay cümlesini aynen yazın.

Geri yükleme kuralları:

- Hedef her zaman oturumunuzda seçili olan tenant'tır. Request body ile belirlenemez.
- Geri yükleme mevcut verinin üstüne yazmaz. Seçilen kapsamda hedef tenant'ta kayıt varsa işlem reddedilir.
- Geri yüklenebilen veri CMS verisidir: içerikler ve sürümleri, içerik tipleri, özel alan tanımları, collection'lar ve kayıtları, medya ve galeriler, kategori, etiket ve taksonomiler, menüler, form tanımları ve placement tanımları. Form cevapları isteğe bağlıdır ve varsayılan olarak seçili değildir.
- Form cevaplarını seçerseniz cevaplar ve kayıtlı durumları birlikte geri yüklenir. Formlar yeniden gönderilmez; gönderim bildirimleri ve webhook işlemleri tetiklenmez.
- Onay, doğrulanan kapsam için geçerlidir. Koleksiyon veya medya dosyası seçimini değiştirmek yeniden dry-run gerektirir.
- Drive üzerinden geri yükleme, bağlı hesaptaki orijinal yedekleri okur; Drive’dan indirilen ZIP dosyasını içe aktarmaz.
- **Geri yüklenmez:** kullanıcılar, roller, üyelikler, API token'ları, faturalandırma ve abonelik verisi, webhook'lar, secret'lar, analytics ve event verisi. Hedef tenant kendi kullanıcı ve yetkilerini korur.
- Geri yükleme sürerken hedef tenant'ta içerik düzenlemeyin.

## Tenant izolasyonu

- Tenant, kullanıcı girdisinden değil; doğrulanmış oturumdan veya tenant'ın kendi kayıtlı planından alınır.
- Dışa aktarılan her kayıt yazılmadan önce tenant'a göre kontrol edilir.
- Bir medya objesi yalnızca aynı tenant'a ait bir medya kaydı ona referans veriyorsa kopyalanır.
- Tüm yedek yolları tenant kimliğinin altında köklenir; özel prefix bu kökün dışına çıkamaz.

## Sınırlar ve notlar

- Yedekleme zamanlaması günlüktür. Saatlik veya sürekli yedekleme sunulmaz.
- Yedek dosyaları ContextHub'a geri yükleme için tasarlanmış ContextHub'a özgü bir formattadır. Drive'da veya bucket'ta yeniden adlandırmayın, düzenlemeyin; geri yükleme checksum doğrular ve değişmiş dosyaları reddeder.
- Yedek klasörünü silmek veya Google hesabınızdan erişimi kaldırmak, yeniden bağlanana kadar sonraki çalışmaları durdurur.
- Tenant yedekleme yönetilen bir ContextHub Cloud yeteneğidir ve community repoda yer almaz. Bkz. [Yönetilen ve ticari yetenekler](./managed-capabilities.md) ve [Fiyatlandırma ve paketler](./pricing-and-plans.md).
