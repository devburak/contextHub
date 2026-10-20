# Webhook ve invalidation

ContextHub Cloud webhook'ları tenant içeriği değiştiğinde backend'inizi bilgilendirir. Cache, search index, feed ve diğer türetilmiş verileri yenilemek için kullanın.

## Receiver sırası

1. Raw request body'yi okuyun.
2. Webhook secret ile signature'ı timing-safe karşılaştırmayla doğrulayın.
3. Replay penceresinin dışındaki timestamp'leri reddedin.
4. Event ID'yi durable storage'da deduplicate edin.
5. İşi durable queue'ya alın.
6. Hızlıca success dönün ve invalidation'ı async işleyin.

## Idempotency ve retry

Delivery at-least-once'dır. Aynı event'i iki kez işlemek güvenli olmalıdır. Yalnızca durable kabul sonrası `2xx`, kalıcı geçersiz isteklerde `4xx`, geçici hatalarda `5xx` dönün. Sınırlandırılmış exponential backoff ve dead-letter queue kullanın.

## Cache invalidation

- Publish/update: ID, slug, ilgili liste, search ve bağımlı sayfaları temizleyin.
- Unpublish/delete: eski slug ve türetilmiş search kayıtlarını da kaldırın.
- Slug değişikliği: eski ve yeni slug'ı temizleyin.
- Collection update: entry, collection listesi ve bağımlı görünümleri temizleyin.
- Menu/placement update: kararlı resource key'ini temizleyin.

Webhook secret'ları secret manager'da bulunmalıdır. Rotate edin, loglardan çıkarın ve signature debug bilgisini unauthenticated kullanıcıya açmayın.

Webhook yönetim UI'ı ve delivery operasyonları yönetilen ContextHub Cloud admin deneyiminin parçasıdır.

## Bildirim kanalları

Tüm kanallar ücretsiz ve ücretli bütün planlarda ek özellik yetkisi gerektirmeden sunulur. Müşteri kendi hesabını bağlar; tenant yönetim yetkisi korunur.

**Varlıklar → Webhooks** ekranında kanal ve olayları seçerek abonelik oluşturun. Slack, Telegram ve WhatsApp aynı kalıcı teslimat kuyruğunu, tekrar denemeleri ve teslimat günlüğünü kullanır. Bildirimde olay türü, tenant kimliği, olay kimliği ve zaman bulunur; form yanıtları veya tüm içerik mesaja eklenmez.

- [Slack bağlantı rehberi](./slack-notifications.md): webhook URL'si girmeden kendi çalışma alanınıza izin verip kanal seçin.
- [Telegram bağlantı rehberi](./telegram-notifications.md): kendi botunuzu oluşturup sohbet kimliğini bulun ve bağlayın.
- [WhatsApp bağlantı rehberi](./whatsapp-notifications.md): Business hesabınızı ve onaylı üç parametreli şablonu hazırlayın.
- [Yöneticiler için sağlayıcı kurulumu](./notification-provider-setup.md): Slack uygulaması/OAuth ayarları, kimlik bilgisi şifrelemesi, mevcut SMTP ve Graph API sürümü.

## Filtreler ve gövde

Olay türü, dil, ortam ve koleksiyon anahtarı filtreleri birlikte sağlanmalıdır. Aynı filtre içindeki değerlerden birinin eşleşmesi yeterlidir; boş filtre tüm değerleri kapsar. Dil `payload.locale` veya `payload.response.locale` üzerinden eşleşir. Dil bilgisi taşımayan olay, dolu dil filtresine uymaz. Ortam olay oluşturulurken `APP_ENV`, yoksa `NODE_ENV` veya `development` değeridir. Eski olaylarda ortam bilgisi yoksa dolu ortam filtresi eşleşmez. Koleksiyon anahtarı koleksiyon olayları içindir. İçerik modelinde ayrı kalıcı içerik tipi alanı bulunmadığından olay türleri ve koleksiyon anahtarları kullanılır.

HTTP webhook gövdesi **event** (mevcut olay anlık görüntüsü) veya **ids** (olay ve kaynak kimlikleri) olabilir. Event seçeneği tüm içerik belgesi anlamına gelmez: mevcut içerik olayları kimlik/durum/sürüm bilgisi taşır; form gönderimi olaylarında yanıtlar bulunabilir. Gerektiğinde IDs seçip kaynağı tenant API’sinden çekin. Mesajlaşma kanalları daima kısa olay özeti gönderir.

## Zaman damgalı imza

Uyumluluk için eski `X-CTXHUB-SIGNATURE` ham gövde üzerinden HMAC-SHA256 olarak korunur. Alıcıları şu başlıklara geçirin:

- `X-CTXHUB-TIMESTAMP`: Unix saniye, her denemede yenilenir.
- `X-CTXHUB-SIGNATURE-V2`: `v1=<HMAC-SHA256(secret, timestamp + "." + rawBody) hex özeti>`.
- `X-CTXHUB-EVENT`: olay türü.
- `X-CTXHUB-DELIVERY-ID`: olay kimliği ve abonelik kimliğinden oluşan sabit değer.

Saatinizden 300 saniyeden fazla uzak zaman damgalarını reddedin. Eksik/geçersiz başlıkları reddedip 32 baytlık imzayı `crypto.timingSafeEqual` ile karşılaştırın; V2 doğrulanamazsa eski imzaya geri dönmeyin. İzin verilen zaman aralığındaki tekrarı da engellemek için olay/abonelik kimliğini kalıcı ve benzersiz kaydedin. Tekrar deneme ve manuel yeniden gönderme olay kimliğini korur; alıcı idempotent çalışmalıdır. `2xx` yanıtını kalıcı kabulden sonra verin.

## Teslimat işlemleri

Worker varsayılan olarak beş saniyede bir çalışır ve zamanı gelen hatalı işleri yeniden dener. HTTP 408, 429, 5xx ve ağ hatalarında artan bekleme ve jitter uygulanır; diğer 4xx hataları doğrudan dead olur. `Retry-After` ve Telegram `retry_after` sonraki denemeyi geciktirir; sağlayıcı bekleme süresi en fazla 24 saattir. Varsayılan 5 deneme, 60 saniye temel aralık ve bir saat exponential backoff üst sınırıdır. Yanıt okuması dahil toplam HTTP süresi 15 saniye, DNS çözümleme üst sınırı beş saniyedir. Yanıtlar sınırlı önizlemelerle okunur ve redirect takip edilmez. Üretimde HTTPS zorunludur; özel/rezerve IP, karma public/private DNS yanıtları, yerel adlar ve IPv6 çeviri/tünel aralıkları engellenir. Bağlantı kontrol edilen DNS sonucuna sabitlenir.

`WEBHOOK_DISABLE_AFTER_FAILURES` kadar art arda hatalı denemeden sonra (varsayılan 10; farklı teslimatları da kapsar) abonelik durur. Sahip rolündeki kullanıcılara e-posta kalıcı olarak sıraya alınır; SMTP hatası teslimattan bağımsız yeniden denenir. Aboneliği düzenleyerek açın, sonra dead işleri inceleyip yeniden gönderin. Pasif/silinmiş abonelik işleri başarılı sayılmaz, dead olur. İki dakika processing durumunda kalmış işler yeni kilit kimliğiyle kurtarılır. Worker çöktüğünde alıcı daha önce isteği kabul etmiş olabilir; teslimat en az bir kez garantisiyle çalışır.

Panel günlüğü başarılı/hatalı/dead teslimatları, HTTP kodunu, süreyi, sonraki denemeyi ve son 20 denemeyi gösterir. HTTP istek önizlemesi 4096 karakter, yanıt 2048 baytla sınırlıdır. Sağlayıcı istek/yanıt gövdeleri ve kimlik bilgileri kaydedilmez. Tekil yeniden gönderim yalnızca tamamlanmış/hatalı/dead işler ve aktif abonelik için yapılır. Toplu işlemler korunur. Dead işler cron ile varsayılan yedi günlük süreden sonra temizlenir; tüm outbox kayıtlarında mevcut 180 günlük TTL geçerlidir.

Yeni işlerin benzersiz deduplikasyon anahtarı vardır; olay dağıtımı idempotent upsert kullanır. Gerekli kısmi benzersiz indeks API açılışında doğrulanır; eski yinelenmiş kayıtlar silinmez ve geriye dönük birleştirilmez. Güncelleme sonrası bağımsız dispatcher betiklerinden önce normal API açılışını/indeks kurulumunu çalıştırın.

Yeni operasyon uçları (tümünde tenant yetkisi kontrol edilir):

- `POST /admin/tenants/:tenantId/webhooks/slack/connect` ve `/slack/complete`
- `GET /admin/tenants/:tenantId/webhooks/deliveries?limit=30&webhookId=<isteğe-bağlı-kimlik>`
- `POST /admin/tenants/:tenantId/webhooks/deliveries/:deliveryId/replay`

API worker otomatik başlar; yalnızca harici worker kullanılıyorsa `WEBHOOK_SCHEDULER_ENABLED=false` tanımlayın. API worker açık tutulmalı veya süreç içi zamanlayıcılar kapalıysa mevcut webhook cron düzenli çalıştırılmalıdır. Sahip bildirimleri için tenant veya genel SMTP yapılandırılmalıdır. Üretimde müşteri bildirimlerini açmadan önce sağlayıcı kurulumu ve gerçek uçtan uca gönderim testi gerekir.
