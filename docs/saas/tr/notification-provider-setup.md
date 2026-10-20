# Bildirim sağlayıcılarının kurulumu

Bu sayfa ContextHub yöneticileri içindir. Müşteriler [Slack](./slack-notifications.md), [Telegram](./telegram-notifications.md) veya [WhatsApp](./whatsapp-notifications.md) bağlantı rehberini izler. Tüm kanallar ücretsiz ve ücretli bütün planlarda sunulur; varlık yönetim yetkisi korunur.

## Hangi ayarı kim yapar?

| Kanal | ContextHub yöneticisi, kurulum başına bir kez | Her müşteri |
| --- | --- | --- |
| Slack | Ortak Slack uygulaması, Incoming Webhooks, OAuth bilgileri, tam HTTPS dönüş adresi, dağıtım | Kendi çalışma alanına izin verip kanal seçer. |
| Telegram | Kimlik bilgisi şifrelemesi ve Telegram'a HTTPS çıkışı | Kendi botunu oluşturur, hedefi hazırlar, bot token'ı ve sohbet kimliğini girer. |
| WhatsApp | Kimlik bilgisi şifrelemesi ve desteklenen Graph API sürümü | Kendi Business Cloud API göndericisini, token'ını, alıcıyı ve onaylı şablonu hazırlar. |
| Hata e-postaları | Mevcut tenant/genel SMTP servisi | Kanal bağlamak için ek SMTP hesabı gerekmez. |

## Mevcut şifreleme anahtarları ve SMTP

Mevcut uygulama `WEBHOOK_CREDENTIALS_KEY` kullanır: base64 kodlu rastgele **32 bayt**. Secret manager'da veya özel terminalde bir kez üretin:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Sonucu API ve bağımsız dispatcher/cron çalışma ortamlarının tümünde `WEBHOOK_CREDENTIALS_KEY` olarak saklayın. Değeri dokümana, kaynak kod deposuna veya müşteri formuna koymayın. Sürümler ve yedekler arasında sabit tutun. Değiştirirseniz mevcut kanal kimlik bilgileri çözülemez; anahtar geçişi/yeniden bağlantı gerekir.

`SMTP_SECRET_KEY` tenant SMTP parolalarını, `EXTENSION_SECRET_KEY` eklenti sırlarını, `BILLING_PII_ENCRYPTION_KEY` fatura verilerini korur. Hiçbiri `WEBHOOK_CREDENTIALS_KEY` yerine otomatik kullanılmaz. SMTP'nin kurulu olması bu yeni anahtarın da tanımlı olduğunu göstermez.

Hata bildirimleri mevcut mail servisini çağırır; varsa tenant SMTP'si, yoksa genel SMTP kullanılır. Çalışan yapılandırmayı kullanın; bu entegrasyonlar için yeni posta sunucusu kurmayın. E-posta, hata uyarıları içindir; Slack/Telegram/WhatsApp gönderimini yapmaz. Canlı ortam kontrolünde gizli değerleri yazdırmadan yalnızca gerekli ayarların tanımlı olup olmadığı incelenmelidir.

## Slack yönetici kurulumu

1. [Slack uygulama panelinde](https://api.slack.com/apps) bir ContextHub uygulaması oluşturun.
2. **Incoming Webhooks** özelliğini açın.
3. **OAuth & Permissions** altında `incoming-webhook` bot yetkisini ekleyin. Admin host'unuz `ctxhub.net` ise `https://ctxhub.net/varliklar/webhooks` adresini dönüş URL'si olarak kaydedin. Başka kurulumda gerçek HTTPS admin host'unuzu kullanın.
4. API çalışma ortamında `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` ve birebir aynı `SLACK_REDIRECT_URI` değerini tanımlayın. Dönüş adresi giriş yapılmış admin sayfasıdır; API callback adresi değildir.
5. Başka çalışma alanlarının izin verebilmesi için uygun dağıtım biçimini açın. Önce kontrollü pilot kurulum yapın. Tüm müşterilere ticari dağıtım için [Slack'in ticari dağıtım gereksinimlerine](https://docs.slack.dev/changelog/2025/05/29/tos-updates/) uygun Marketplace başvuru/inceleme sürecini tamamlayın.
6. Ayrı bir çalışma alanından ve erişim izni bulunan özel kanaldan kurulum deneyin. Seçili kanalın kaydedildiğini ve test bildirimi aldığını doğrulayın.

Yalnızca `incoming-webhook` istenir; gönderim OAuth yanıtındaki webhook üzerinden yapılır. Mesaj geçmişi yetkileri, Slack Signing Secret, Events API URL'si veya müşterinin ayrıca geliştirici uygulaması oluşturması gerekmez. Uygulama ayarları için [Slack OAuth](https://docs.slack.dev/authentication/installing-with-oauth/) ve [dağıtım rehberine](https://docs.slack.dev/app-management/distribution/) bakın.

## Telegram ve WhatsApp sunucu ayarları

Telegram için ortak bot, OAuth client ID veya Telegram app secret tanımlanmaz. Müşterinin bot bilgileri ve `api.telegram.org` adresine HTTPS çıkışı kullanılır.

`WHATSAPP_GRAPH_API_VERSION` değerini müşterinin Meta uygulamasının desteklediği Graph sürümüne ayarlayın. Mevcut doğrudan kimlik bilgisi akışında merkezi Meta app ID/secret veya Embedded Signup ayarı kullanılmaz. Müşteriler kendi bilgilerini sağlar. İstekler `graph.facebook.com` adresine gider.

Müşterinin desteklediği sürümü kontrol etmeden eski örneklerdeki sürümü kopyalamayın. [Meta'nın resmi Cloud API koleksiyonuna](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api) bakın.

## Yayın ve kabul kontrolü

Müşterilere kullanım açıldığını duyurmadan önce API'yi ve eşleşen admin özelliğini yayımlayın. Sağlayıcı kurulumu hazırlanırken rehberler docs kataloğunda bulunabilir; dokümanın varlığı canlı ortamın yapılandırıldığını tek başına göstermez.

Normal API açılışı gerekli outbox indekslerini doğrular ve webhook worker'ını başlatır. `WEBHOOK_SCHEDULER_ENABLED=false` ise harici worker/cron çalıştırın. Her gönderim ortamında aynı şifreleme anahtarı bulunmalıdır. PM2 süreç ortamı `.env` değerlerini geçersiz kılabilir; yönetilen reload sonrasında çalışan süreci kontrol edin.

Her kanalda müşteriye ait hedefi bağlayın, test gönderin, seçili gerçek olayı tetikleyip teslimat günlüğüne bakın. HTTP 429/tekrar deneme ve uç nokta kurtarmayı kontrollü test alıcısında doğrulayın. Sağlayıcı sırlarının API yanıtına veya günlük önizlemesine girmediğini kontrol edin. İmzalar, tekrar sınırları ve otomatik durdurma için [webhook işlemlerini](./webhooks.md) inceleyin.
