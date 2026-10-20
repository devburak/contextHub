# WhatsApp bildirimleri

Kendi WhatsApp Business Cloud API hesabınız üzerinden olay özetleri gönderin. Entegrasyon ücretsiz ve ücretli tüm ContextHub planlarında bulunur; Meta'nın hesap gereksinimleri ve mesaj ücretleri ayrıdır. Bu akış Business API kullanır; kişisel WhatsApp girişi veya Embedded Signup akışı değildir.

## Business hesabınızı hazırlayın

Meta işletme portföyü, WhatsApp Business Account ve Cloud API için etkin gönderen telefon numarası gerekir. [Meta'nın resmi Cloud API başlangıç koleksiyonunu](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api) izleyin.

Kendi Meta uygulamanızdan/WhatsApp Manager'dan şu bilgileri alın:

| ContextHub alanı | Girilecek bilgi |
| --- | --- |
| Erişim token’ı | Gönderen hesaptan mesaj gönderme yetkisi olan geçerli token; üretimde geçici panel token'ı yerine uygun yetkili system user token'ı kullanın. |
| Gönderen telefon numarası kimliği | Cloud API'nin sayısal **phone number ID** değeri; görünen telefon numarası veya Business Account ID değildir. |
| Alıcı numarası | Bu mesajları almayı kabul etmiş kişinin numarası; ülke koduyla ve yalnızca rakamlarla, örneğin `905551234567`. |
| Onaylı şablon adı | Aşağıdaki üç parametreli şablonun tam adı. |
| Şablon dili | Onaylanan dil kodunun aynısı; örneğin `tr` veya `en_US`. |

Gönderim için `whatsapp_business_messaging` kullanılır. Hesap/şablon yönetimi ayrıca `whatsapp_business_management` gerektirebilir; ilgili işletme varlıklarını token'ın system user'ına atayın. Token türleri ve yetkiler [resmi koleksiyonda](https://www.postman.com/meta/whatsapp-business-platform/collection/wlk6lh4/whatsapp-cloud-api) açıklanır. Token süresi ve iptali Meta'dan yönetilir; ContextHub token'ı otomatik yenilemez.

## Uyumlu mesaj şablonu oluşturun

WhatsApp Manager'da örneğin `contexthub_event` adlı metin şablonu oluşturun. Gövdede aşağıdaki sırayla tam üç konumsal değişken kullanın:

| Değişken | ContextHub'ın yerleştirdiği değer |
| --- | --- |
| `{{1}}` | Olay türü; örneğin `content.published` |
| `{{2}}` | Olay kimliği |
| `{{3}}` | Varlık kimliği |

Onaya gönderebileceğiniz Türkçe gövde örneği:

```text
ContextHub bildirimi
Olay: {{1}}
Olay kimliği: {{2}}
Varlık: {{3}}
Ayrıntılar için ContextHub panelinizi açın.
```

Gerçek kullanımınıza uygun kategoriyi seçip Meta formunda örnek değerleri doldurun. ContextHub'a gireceğiniz dilin onaylanmasını bekleyin. Onaya Meta karar verir. Mevcut adaptör yalnızca üç gövde metin parametresi gönderir; medya/başlık/buton parametresi veya adlandırılmış değişken isteyen şablon seçmeyin. [Meta'nın şablon mesajı isteğini](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text) inceleyebilirsiniz.

## Bağlayıp test edin

1. ContextHub'da varlığı seçip **Varlıklar → Webhooks** ekranını açın.
2. Kanalı **WhatsApp Business** olan abonelik oluşturun.
3. Yukarıdaki beş alanı doldurun, olayları seçip kaydedin. İlk testte isteğe bağlı filtreleri boş bırakın.
4. **Test gönder** ile hedef numarayı ve **Teslimat günlüğü** bölümünü kontrol edin.
5. Normal akışı doğrulamak için seçtiğiniz olaya uygun bir içerik yayımlayın.

Test aynı onaylı şablon üzerinden `webhook.test` olayı gönderir. Mesajda kimlikler ve olay türü bulunur; tüm içerik veya form yanıtları bulunmaz. ContextHub'da başarılı teslimat Meta'nın API isteğini kabul ettiğini gösterir; telefona nihai teslim ve okundu bilgileri bu entegrasyonda izlenmez.

## Sorun giderme ve değişiklikler

| Sorun | Yapılacak işlem |
| --- | --- |
| Token reddedildi | Meta'dan süreyi, yetkileri ve gönderen varlıklarına erişimi kontrol edin. |
| Gönderen reddedildi | Telefon numarası veya WABA ID yerine phone number ID kullanın. |
| Şablon/dil/parametre hatası | Onayı, tam adı, dili ve tam üç konumsal gövde metin parametresini doğrulayın. |
| Alıcı reddedildi | Ülke kodunu, alıcı iznini ve Meta test hesabının alıcı kısıtlarını kontrol edin. |
| Graph API sürümü tanımlı değil | Yöneticiden [sağlayıcı kurulumunu](./notification-provider-setup.md) tamamlamasını isteyin. |
| Abonelik otomatik durduruldu | Sağlayıcı hatasını çözün, aboneliği açıp günlükteki ilgili işi yeniden gönderin. |

Kimlik bilgilerini veya hedefi değiştirmek için düzenleme ekranında token dahil beş alanı yeniden doldurun. Token boş bırakılırsa mevcut bağlantı korunur. Aboneliği silmek ContextHub gönderimlerini durdurur; kullanılmayan token'ları Meta'dan ayrıca iptal edin. Ortak [filtreler, tekrar denemeler ve teslimat işlemleri](./webhooks.md) burada da geçerlidir.
