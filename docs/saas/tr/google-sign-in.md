# Google ile giriş

ContextHub Cloud admin kullanıcıları `ctxhub.net` üzerinde parola yazmak yerine Google hesabıyla giriş yapabilir. Google ile giriş, kişiler için ek bir giriş yöntemidir; API token'larının yerini almaz, tenant rol ve permission'larını değiştirmez.

## Kısa bilgiler

| Soru | Cevap |
| --- | --- |
| Nerede kullanılır? | ContextHub Cloud admin giriş ve kayıt sayfalarında; hesap bağlama için Profil sayfasında. |
| Hangi paketlerde var? | Free dahil tüm paketlerde. Tenant entitlement'ı değil, hesap özelliğidir. |
| Google ne paylaşır? | Yalnızca temel kimlik: `openid`, `email` ve `profile`. |
| Google Drive erişimi verir mi? | Hayır. Drive ayrı bir izindir ve yalnızca [tenant yedekleme](./tenant-backup.md) tarafından kullanılır. |
| Parola ile giriş devam ediyor mu? | Evet. E-posta ve parola ile giriş Google'ın yanında çalışmaya devam eder. |
| Kurumsal SAML veya özel OIDC sağlayıcısı mı? | Hayır. Bireysel kullanıcılar için Google hesabıyla giriştir. |

## Google ile nasıl giriş yaparım?

1. ContextHub Cloud giriş sayfasını açın ve **Google ile giriş** seçeneğini kullanın.
2. Bir Google hesabı seçin ve kimlik iznini onaylayın.
3. ContextHub, Google yanıtını doğrular ve admin oturumunu açar.

Açılan oturum, [Kimlik doğrulama ve tenant yapısı](./authentication.md) sayfasında anlatılan HttpOnly cookie oturumunun aynısıdır. Tenant üyeliği, rol ve permission'lar parola ile girişteki gibi uygulanır.

## İlk girişte ne olur?

- **Bu e-posta ile ContextHub hesabı yoksa:** Google'dan gelen ad ve e-posta ile yeni hesap oluşturulur, e-posta doğrulanmış sayılır. Bir tenant oluşturana veya davet kabul edene kadar hesabın tenant'ı yoktur.
- **Bu e-posta ile ContextHub hesabı zaten varsa:** hesapları siz bağlayana kadar Google ile giriş reddedilir. Parolanızla giriş yapın, **Profil** sayfasını açın ve **Hesabını Google Bağla** seçeneğini kullanın. Bu kural, aynı adresi kontrol eden birinin mevcut hesabı ele geçirmesini engeller.

## Google hesabını nasıl bağlar veya ayırırım?

Bağlama ve ayırma admin'deki **Profil** sayfasında yapılır.

- **Bağlama:** oturum açıkken **Hesabını Google Bağla** seçeneğini kullanın. Google hesabının doğrulanmış e-postası ContextHub hesap e-postanızla aynı olmalıdır. Bir Google hesabı tek bir ContextHub hesabına bağlanabilir.
- **Ayırma:** **Hesabı ayır** seçeneğini kullanın ve mevcut parolanızla onaylayın. Hesap Google ile oluşturulduysa ve hiç parola belirlemediyseniz önce şifre sıfırlama akışıyla parola oluşturun, sonra ayırın.

Ayırdıktan sonra hesap yalnızca e-posta ve parola ile giriş yapar.

## ContextHub neleri doğrular?

- PKCE (`S256`) ile authorization code akışı, tarayıcıya bağlı tek kullanımlık `state` ve `nonce`. Giriş denemesi on dakika sonra geçersiz olur.
- Google ID token imzası, issuer, audience, süre ve nonce.
- Google e-postayı doğrulanmış olarak bildirmelidir.
- Devre dışı hesaplar ve önce parola değiştirmesi gereken hesaplar Google ile giriş yapamaz.
- Akış sürerken oturum iptal edildiyse veya hesap değiştiyse bağlama reddedilir.

ContextHub, sonraki girişte sizi tanımak için Google'ın sabit hesap tanımlayıcısını saklar. Giriş için Google access token veya refresh token saklamaz.

## Google ile giriş ne değildir?

- **API kimlik bilgisi değildir.** Sunucu entegrasyonları, build hatları ve migration'lar `ctx_...` API token kullanmaya devam eder. Bkz. [API token yaşam döngüsü](./api-token-lifecycle.md).
- **Kendi site ziyaretçileriniz için giriş değildir.** API üzerine kurduğunuz sitelerin son kullanıcılarını değil, ContextHub admin kullanıcılarını doğrular.
- **Tenant düzeyinde SSO değildir.** Tenant'a özel kimlik sağlayıcı, alan adı kısıtı veya zorunlu SSO politikası yoktur. Erişim yine [rol ve permission'larla](./roles-permissions.md) yönetilir.

## Sorun giderme

| Belirti | Yapılacak |
| --- | --- |
| "Bu e-posta ile mevcut bir hesabınız var" | Parolanızla giriş yapın, ardından Profil'den Google hesabını bağlayın. |
| Bağlama başarısız | Google hesap e-postasının ContextHub hesap e-postanızla aynı olduğunu kontrol edip tekrar deneyin. |
| "Google işlemi tamamlanamadı" | Deneme süresi doldu, izin iptal edildi veya tarayıcı akış cookie'sini engelledi. Giriş sayfasından yeniden başlayın. |
| Google düğmesi görünmüyor | O kurulumda Google ile giriş etkin değildir. Self-hosted kurulumlar kendi Google OAuth client'ını yapılandırmalıdır. |
