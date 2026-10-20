# Slack bildirimleri

Kendi Slack çalışma alanınızı bağlayarak ContextHub olaylarını bir kanalda takip edin. Entegrasyon ücretsiz ve ücretli tüm planlarda kullanılabilir. Seçili varlığı yönetme ve hedef Slack çalışma alanına ContextHub uygulamasını kurma yetkiniz olmalıdır.

## Çalışma alanını bağlayın

1. ContextHub'a giriş yapıp bildirimlerini almak istediğiniz varlığı seçin.
2. **Varlıklar → Webhooks** ekranında abonelik oluşturun.
3. Bildirim kanalı olarak **Slack** seçin.
4. Örneğin `content.published` olayını seçin. İlk testte isteğe bağlı filtreleri boş bırakın.
5. **Slack’e bağla** düğmesine basın. Slack'in izin ekranı açılır.
6. Çalışma alanını kontrol edin, hedef kanalı seçin ve uygulamaya izin verin. Çalışma alanı yöneticinizin kurulum onayı gerekebilir.
7. ContextHub'a döndüğünüzde abonelikte bağlı kanal görünür.
8. **Test gönder** ile deneyin; hem Slack kanalını hem **Teslimat günlüğü** bölümünü kontrol edin.

Slack geliştirici uygulaması oluşturmanız veya webhook URL'si girmeniz gerekmez. Ortak uygulamayı ContextHub yöneticisi bir kez kurar; her müşteri kendi çalışma alanı/kanalı için izin verir. Kanal seçimini Slack'in [`incoming-webhook` yetkisi](https://docs.slack.dev/reference/scopes/incoming-webhook) sağlar.

## Slack'e ne gönderilir?

Mesajda olay türü, varlık kimliği, olay kimliği ve olay zamanı bulunur. Form yanıtları ve tüm içerik belgesi mesaja eklenmez. Örnek bildirim:

```text
ContextHub · content.published
Tenant: <varlık-kimliğiniz>
Event: <olay-kimliği>
<olay-zamanı>
```

Olay filtreleri hangi bildirimlerin kuyruğa gireceğini belirler. Dil filtresi yalnızca dil bilgisi taşıyan olaylarda eşleşir. [Filtreler ve teslimat davranışı](./webhooks.md) sayfasını inceleyin.

## Değiştirme ve bağlantıyı kaldırma

Olayları, filtreleri veya aktiflik durumunu değiştirmek için aboneliği düzenleyin. Başka çalışma alanına/kanala geçmek için yeni bir Slack aboneliği oluşturun; testten sonra eskisini kaldırın. ContextHub aboneliğinin silinmesi gönderimleri durdurur, uygulamayı Slack'ten kaldırmaz. Gerekirse uygulamanın iznini Slack üzerinden ayrıca kaldırın.

## Sorun giderme

| Belirti | Yapılacak işlem |
| --- | --- |
| Slack yapılandırılmamış hatası | ContextHub yöneticisinden [sağlayıcı kurulumunu](./notification-provider-setup.md) tamamlamasını isteyin. |
| Kurulum için onay gerekiyor | Hedef çalışma alanının yöneticisinden uygulamayı onaylamasını isteyin. |
| Bağlantının süresi doldu | **Slack’e bağla** işlemini yeniden başlatın. İzin akışı on dakika içinde tamamlanmalıdır. |
| Dönüşte başka varlık seçili | ContextHub bağlantıyı başlatan varlığa dönmeyi dener. Geçiş başarısızsa o varlığı seçip dönüş sayfasını yenileyin. |
| Test başarılı, içerik bildirimi gelmiyor | Seçili olayları ve filtreleri kontrol edin; ilk denemede filtreleri boş bırakın. |
| Abonelik otomatik durdurulmuş | Günlüğü inceleyin, Slack erişimi/kanal sorununu çözün, aboneliği açıp ilgili teslimatı yeniden gönderin. |

Başarılı teslimat Slack'in isteği kabul ettiği anlamına gelir; ContextHub kanal üyelerinin mesajı okuyup okumadığını izlemez. Hatalar ortak tekrar deneme politikasını kullanır. Sağlayıcı ayrıntıları için [Slack OAuth akışına](https://docs.slack.dev/authentication/installing-with-oauth/) bakın.

## Ekip ve kişisel bildirim hedefleri

Bir sohbet sağlayıcısı bağlarken **Ekip kanalı** veya **Kişisel bağlantı** seçin. İkisi de geçerli tenant için yönetim yetkisi gerektirir. Ekip bağlantılarını yetkili tenant yöneticileri yönetebilir; kişisel bağlantıyı ve teslimat geçmişini yalnız oluşturan kullanıcı görebilir. Görünürlük oluşturma sırasında belirlenir; değiştirmek için yeni bağlantı oluşturun. Mevcut abonelikler ekip bağlantısı olarak devam eder.

Kişisel bağlantı, tenant içindeki seçili olayları alır; yalnızca o kullanıcının tetiklediği olaylarla sınırlı değildir. Gönderim işçisi her teslimat, tekrar deneme ve yeniden gönderme öncesinde sahibinin aktif hesabını, aktif tenant üyeliğini ve güncel yönetim yetkisini kontrol eder. Erişim kaldırıldığında gönderim durur. Kişisel bağlantının hata e-postası yalnız sahibine gider.

Teslimat kayıtlı hedefe yapılır: Slack yetkilendirmesinde seçilen kanal, Telegram botuna tanımlanan sohbet kimliği veya WhatsApp alıcı numarası. Ortak bir tenant ya da platform alıcısına otomatik geçiş yapılmaz. Kişisel bağlantı dışarıdaki bir grubu özel hale getirmez; Slack/Telegram grup üyelerini ilgili platformun yöneticileri belirler. Bildirimleri açmadan önce özel kanal veya doğrudan sohbet seçin ve üyeleri kontrol edin. Telegram sohbet kimliği amaçlanan sohbeti göstermelidir; bot token'ıyla mesaj gönderebilmek tek başına o sohbetin sahipliğini kanıtlamaz. WhatsApp alıcısının bildirimlere izin vermesi gerekir.

Olay, abonelik ve kuyruk gövdesinin sabit tenant kimlikleri eşleşmek zorundadır. Eksik veya uyumsuz kimlikler dışarıya istek atılmadan engellenir. Tenant slug'ları teslimat kapsamını genişletmez. Kendi sunucusunda eski slug tabanlı abonelik kullanan operatörler bunları etkinleştirmeden önce sabit tenant kimliğine taşımalıdır; şifreli sağlayıcı bilgileri yeni tenant kimliğiyle yeniden şifrelenmelidir. 24 karakterlik onaltılık kimlikleri slug olarak yorumlamayın.
