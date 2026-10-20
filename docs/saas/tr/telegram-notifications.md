# Telegram bildirimleri

Size ait bir botu Telegram özel sohbetine, grubuna veya kanalına bağlayın. Entegrasyon tüm ContextHub planlarında bulunur. Seçili varlığı yönetme yetkiniz olmalıdır. Akış bot token'ı ve sohbet kimliğiyle çalışır; kişisel Telegram hesabıyla giriş yapılmaz.

## Botunuzu oluşturup hazırlayın

1. Telegram'da resmi [BotFather](https://t.me/BotFather) hesabını açıp `/newbot` komutunu kullanın.
2. Bot adı ve kullanıcı adı seçin. BotFather'ın verdiği token'ı gizli tutun.
3. Özel sohbet için yeni botunuzu açıp `/start` gönderin.
4. Grup için botu ekleyip `/start@botunuzun_kullanici_adi` gibi ona yöneltilmiş bir komut gönderin. Kanal için botu mesaj yayımlama yetkisiyle yönetici olarak ekleyin.

Bunlar Telegram'ın bot kurulum adımlarıdır; [resmi bot rehberini](https://core.telegram.org/bots/tutorial) inceleyebilirsiniz.

## Hedef sohbet kimliğini bulun

Sohbetin sayısal kimliğini, gruplarda başındaki eksi işaretiyle birlikte kullanın. Herkese açık hedef için `@kullanici_adi` da kullanılabilir. Botun kendi kullanıcı adı, özel sohbetinizin kimliği yerine geçmez.

Yeni ve başka webhook/polling uygulamasına bağlı olmayan botunuza mesaj/komut gönderip aşağıdaki Python 3 yardımcısını kendi bilgisayarınızda bir kez çalıştırın. Token terminal geçmişine yazılmaz; çıktı yalnızca sohbet kimliği ve adını gösterir:

```python
import getpass
import json
import urllib.request

token = getpass.getpass("Telegram bot token: ").strip()
request = urllib.request.Request(
    "https://api.telegram.org/bot" + token + "/getUpdates",
    data=b"timeout=0",
)
try:
    with urllib.request.urlopen(request, timeout=15) as response:
        result = json.load(response)
except Exception:
    raise SystemExit("Guncellemeler alinamadi; bot kurulumunu ve baglantiyi kontrol edin.")

chats = {}
for update in result.get("result", []):
    message = update.get("message") or update.get("channel_post") or {}
    chat = message.get("chat", {})
    if "id" in chat:
        chats[chat["id"]] = chat.get("title") or chat.get("username") or chat.get("first_name", "")
for chat_id, name in chats.items():
    print(chat_id, name)
```

Sonuç boşsa bota yeni bir mesaj gönderip tekrar deneyin. Bot başka uygulamaya bağlıysa sohbet kimliğini o uygulamanın yöneticisinden alın. Var olan webhook'u kaldırmayın veya ikinci bir polling işlemi başlatmayın: [webhook tanımlıyken `getUpdates` kullanılamaz](https://core.telegram.org/bots/faq#how-do-i-get-updates).

## ContextHub'a bağlayın

1. Varlığı seçip **Varlıklar → Webhooks** ekranında abonelik oluşturun.
2. **Telegram** seçip **Bot token’ı** ve **Sohbet kimliği** alanlarını doldurun.
3. Olayları seçip kaydedin. İlk testte isteğe bağlı filtreleri boş bırakın.
4. **Test gönder** ile hedef sohbeti ve **Teslimat günlüğü** bölümünü kontrol edin.

Mesajlarda olay özeti bulunur; form yanıtları veya tüm içerik belgesi bulunmaz. Başarılı teslimat Telegram'ın API isteğini kabul ettiğini gösterir; okundu bilgisi izlenmez.

## Kimlik bilgilerini güncelleme ve sorun giderme

Hedefi/token'ı değiştirmek için aboneliği düzenleyip iki alanı da yeniden doldurun. Token boş bırakılırsa mevcut bağlantı korunur. Aboneliği silmek ContextHub gönderimlerini durdurur; Telegram botunu silmez veya token'ını iptal etmez.

| Sorun | Kontrol |
| --- | --- |
| Unauthorized | Token doğru kopyalandı mı, iptal edildi mi? |
| Chat not found / forbidden | Sohbet kimliği doğru mu; özel sohbette `/start` gönderildi mi; bot grupta/kanalda ve gönderim yetkili mi? |
| HTTP 429 / hız sınırı | Günlükteki tekrar zamanını bekleyin; ContextHub Telegram'ın bekleme süresine uyar. |
| Test çalışıyor, olay bildirimi gelmiyor | Seçili olayları ve [abonelik filtrelerini](./webhooks.md) kontrol edin. |
| Kimlik bilgileri kaydedilemiyor | Yöneticiden [şifreleme kurulumunu](./notification-provider-setup.md) kontrol etmesini isteyin. |

Sağlayıcı API sözleşmesi için [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage) sayfasına bakın. Ortak ContextHub Telegram botu veya müşterinin gireceği webhook URL'si gerekmez.

## Ekip ve kişisel bildirim hedefleri

Bir sohbet sağlayıcısı bağlarken **Ekip kanalı** veya **Kişisel bağlantı** seçin. İkisi de geçerli tenant için yönetim yetkisi gerektirir. Ekip bağlantılarını yetkili tenant yöneticileri yönetebilir; kişisel bağlantıyı ve teslimat geçmişini yalnız oluşturan kullanıcı görebilir. Görünürlük oluşturma sırasında belirlenir; değiştirmek için yeni bağlantı oluşturun. Mevcut abonelikler ekip bağlantısı olarak devam eder.

Kişisel bağlantı, tenant içindeki seçili olayları alır; yalnızca o kullanıcının tetiklediği olaylarla sınırlı değildir. Gönderim işçisi her teslimat, tekrar deneme ve yeniden gönderme öncesinde sahibinin aktif hesabını, aktif tenant üyeliğini ve güncel yönetim yetkisini kontrol eder. Erişim kaldırıldığında gönderim durur. Kişisel bağlantının hata e-postası yalnız sahibine gider.

Teslimat kayıtlı hedefe yapılır: Slack yetkilendirmesinde seçilen kanal, Telegram botuna tanımlanan sohbet kimliği veya WhatsApp alıcı numarası. Ortak bir tenant ya da platform alıcısına otomatik geçiş yapılmaz. Kişisel bağlantı dışarıdaki bir grubu özel hale getirmez; Slack/Telegram grup üyelerini ilgili platformun yöneticileri belirler. Bildirimleri açmadan önce özel kanal veya doğrudan sohbet seçin ve üyeleri kontrol edin. Telegram sohbet kimliği amaçlanan sohbeti göstermelidir; bot token'ıyla mesaj gönderebilmek tek başına o sohbetin sahipliğini kanıtlamaz. WhatsApp alıcısının bildirimlere izin vermesi gerekir.

Olay, abonelik ve kuyruk gövdesinin sabit tenant kimlikleri eşleşmek zorundadır. Eksik veya uyumsuz kimlikler dışarıya istek atılmadan engellenir. Tenant slug'ları teslimat kapsamını genişletmez. Kendi sunucusunda eski slug tabanlı abonelik kullanan operatörler bunları etkinleştirmeden önce sabit tenant kimliğine taşımalıdır; şifreli sağlayıcı bilgileri yeni tenant kimliğiyle yeniden şifrelenmelidir. 24 karakterlik onaltılık kimlikleri slug olarak yorumlamayın.
