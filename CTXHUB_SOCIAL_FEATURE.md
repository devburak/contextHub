# ContextHub Social Feature Dokümanı

## Doküman Durumu

- **Özellik adı:** `ctxhub-social`
- **Durum:** Taslak / planlama
- **Feature flag:** `ctxhubSocial`
- **İlk provider'lar:** Google, Instagram, Facebook
- **Hedef:** Tenant'ların yetki verdikleri sosyal ve yerel işletme kaynaklarından verileri güvenli biçimde çekmek, ortak bir veri sözleşmesine dönüştürmek ve ContextHub üzerinden yönetilebilir feed'ler olarak servis etmek.

## 1. Özet

`ctxhub-social`, ContextHub tenant'larının Google, Instagram ve Facebook hesaplarını veya kaynaklarını bağlayabilmesini sağlayan opsiyonel bir modüldür. Modül yalnızca tenant için `ctxhubSocial` feature flag'i açık olduğunda görünür ve çalışır.

Bir provider bağlantısı kurulduktan sonra ContextHub:

1. Kullanılabilir sosyal kaynakları keşfeder.
2. Seçilen kaynaklardan gönderi, video, reel veya yorum verilerini çeker.
3. Provider'a özgü yanıtları ortak bir veri sözleşmesine normalize eder.
4. Tenant'ın oluşturduğu feed tanımlarına göre verileri admin veya public API üzerinden servis eder.

Sistem yalnızca Google, Instagram ve Facebook'a göre sabitlenmeyecektir. Provider registry ve adapter sözleşmesi kullanılarak YouTube, TikTok, LinkedIn veya başka kaynaklar sonradan çekirdek akış değiştirilmeden eklenebilecektir.

## 2. Problem

ContextHub kullanıcıları bugün sosyal medya gönderilerini ve işletme yorumlarını kendi uygulamalarında göstermek için her platformla ayrı entegrasyon kurmak zorundadır. Bu yaklaşım aşağıdaki sorunlara yol açar:

- Her tema veya tüketici uygulama provider API'lerini ayrı ayrı öğrenir.
- OAuth, token yenileme ve API key güvenliği tekrar tekrar uygulanır.
- Instagram gönderileri, Facebook gönderileri ve Google yorumları farklı veri şekilleriyle gelir.
- Provider limitleri, hata davranışları ve cache ihtiyaçları tüketici uygulamalara sızar.
- Bir provider değiştiğinde birden fazla tema veya uygulama güncellenmek zorunda kalır.

`ctxhub-social`, bu sorumlulukları ContextHub içinde merkezi bir sosyal veri katmanında toplar.

## 3. Hedefler

### 3.1 Ürün Hedefleri

- Sosyal modülü yalnızca özelliğin açıldığı tenant'lara göstermek.
- Tenant yöneticisinin Google, Instagram ve Facebook bağlantılarını güvenli şekilde kurabilmesini sağlamak.
- Bağlantıdan erişilebilen hesap, sayfa, işletme veya lokasyonları kaynak olarak tanımlamak.
- Birden fazla kaynağı tek bir feed altında birleştirmek.
- Temalara ve tüketici uygulamalara provider bağımsız bir API sunmak.
- Yeni provider eklemeyi düşük maliyetli ve test edilebilir hale getirmek.

### 3.2 Teknik Hedefler

- Credential değerlerini şifreli saklamak ve hiçbir okuma API'sinde geri döndürmemek.
- Feature flag kontrolünü hem admin UI hem API katmanında uygulamak.
- Provider erişimini adapter ve capability sözleşmesiyle soyutlamak.
- Rate limit, retry, cache ve stale fallback davranışlarını merkezileştirmek.
- Tenant izolasyonunu bütün model ve sorgularda korumak.
- Provider'a özgü veri kaybı olmadan ortak bir öğe formatı üretmek.
- Gözlemlenebilir bağlantı ve senkronizasyon durumları sağlamak.

## 4. Kapsam Dışı

İlk sürümde aşağıdakiler hedeflenmez:

- Kişisel Instagram hesaplarından veri çekmek.
- Kullanıcının yetki vermediği rastgele Instagram veya Facebook hesaplarını taramak.
- Sosyal ağlara ContextHub üzerinden gönderi yayınlamak.
- Yorumlara veya mesajlara ContextHub üzerinden cevap vermek.
- Sosyal mesaj kutusu veya moderasyon paneli oluşturmak.
- Sosyal medya reklam yönetimi yapmak.
- Provider verisini süresiz bir sosyal arşiv olarak saklamak.
- Provider şartlarını aşmak için scraping kullanmak.

Bu yetenekler ileride ayrı kapsam ve izin değerlendirmesiyle ele alınabilir.

## 5. Temel Kavramlar

### 5.1 Provider

Dış platform ailesini veya API ürününü ifade eder.

Örnekler:

- `meta`
- `google`
- Gelecekte `youtube`, `tiktok`, `linkedin`

### 5.2 Connection

Tenant'ın bir provider'a verdiği yetkiyi ve credential durumunu temsil eder. Bir connection birden fazla source üretebilir.

Örnekler:

- Bir Meta OAuth bağlantısı
- Bir Google OAuth bağlantısı
- Google Places API key bağlantısı

### 5.3 Source

Verinin alındığı gerçek hesabı, sayfayı, işletmeyi veya lokasyonu temsil eder.

Örnekler:

- Instagram profesyonel hesabı
- Facebook sayfası
- Google Place ID
- Google Business Profile lokasyonu

### 5.4 Item

Provider'dan alınan ve normalize edilen tek veri öğesidir.

Desteklenmesi planlanan ilk türler:

- `post`
- `image`
- `video`
- `reel`
- `carousel`
- `review`

### 5.5 Feed

Bir veya daha fazla source'tan hangi öğelerin, hangi sırayla ve hangi görünürlükle servis edileceğini tanımlar.

## 6. Provider Kapsamı

### 6.1 Google Places

**Kimlik doğrulama:** API key

**Kaynak:** Google Place ID

**İlk yetenekler:**

- Mekân adı ve temel kimliği
- Puan ve toplam değerlendirme sayısı
- API'nin döndürdüğü yorumlar
- Yorum yazarı, puanı, metni, tarihi ve Google Maps bağlantısı

**Önemli sınır:** Google Places Place Details yanıtı en fazla 5 yorum döndürür. Bu nedenle bu adapter tam yorum arşivi olarak sunulmayacaktır.

### 6.2 Google Business Profile

**Kimlik doğrulama:** OAuth 2.0

**Kaynak:** Yetkili Google Business Profile hesabı ve lokasyonu

**Planlanan yetenekler:**

- Tenant'ın sahip olduğu veya yönetmeye yetkili olduğu lokasyonları keşfetmek
- Lokasyon yorumlarını sayfalı olarak çekmek
- Yorumların güncellenme zamanını izlemek

Bu provider Google Places'tan ayrı tutulacaktır. Places hızlı ve API key tabanlı bir okuma sunarken Business Profile işletme sahibi/yöneticisi yetkisi gerektirir.

### 6.3 Instagram

**Kimlik doğrulama:** Meta/Instagram OAuth

**Kaynak:** Instagram profesyonel Business veya Creator hesabı

**İlk yetenekler:**

- Hesap kimliği ve profil bilgileri
- Gönderi listesi
- Görsel, video, carousel ve reel ayrımı
- Medya URL'si veya thumbnail
- Kalıcı gönderi bağlantısı
- Yayın tarihi
- İzin verildiği ölçüde açıklama ve etkileşim sayıları

Kişisel Instagram hesapları ve yetkisiz üçüncü taraf hesaplar kapsam dışıdır. Token yaşam süresi ve yenileme durumu connection üzerinde takip edilecektir.

### 6.4 Facebook Pages

**Kimlik doğrulama:** Meta OAuth

**Kaynak:** Kullanıcının yönetmeye yetkili olduğu Facebook sayfası

**İlk yetenekler:**

- Sayfa kimliği ve temel profil bilgileri
- Sayfa gönderileri
- Görsel ve video ekleri
- Kalıcı gönderi bağlantısı
- Yayın tarihi
- İzin verildiği ölçüde etkileşim sayıları

Facebook Pages ve Instagram aynı Meta uygulamasını veya OAuth altyapısını paylaşabilse de ayrı source adapter'ları olacaktır. Böylece capability ve normalizasyon farkları açık kalır.

## 7. Capability Modeli

Her provider aynı yetenekleri sunmaz. Ortak servis, desteklenmeyen alanları uydurmak yerine provider capability listesini döndürmelidir.

Önerilen capability değerleri:

```text
discover_sources
list_items
pagination
posts
images
videos
reels
carousels
reviews
ratings
engagement_metrics
webhooks
token_refresh
```

Örnek provider tanımı:

```js
{
  key: 'instagram',
  authProvider: 'meta',
  capabilities: [
    'discover_sources',
    'list_items',
    'pagination',
    'posts',
    'images',
    'videos',
    'reels',
    'carousels',
    'token_refresh'
  ]
}
```

## 8. Önerilen Mimari

```text
Admin UI / Consumer Theme
           |
           v
ContextHub Social Routes
           |
           v
Social Service + Feature/Permission Guard
           |
     +-----+-------------------+
     |                         |
     v                         v
Feed Resolver            Connection Manager
     |                         |
     v                         v
Cache / Snapshot          Credential Vault
     |                         |
     +------------+------------+
                  |
                  v
           Provider Registry
                  |
       +----------+----------+
       |          |          |
       v          v          v
   Instagram   Facebook    Google
    Adapter     Adapter    Adapters
```

### 8.1 Kod Organizasyonu

İlk sürümde gerçek bir runtime plugin loader oluşturmak yerine modüler, feature flag ile açılan bir uygulama modülü önerilir.

```text
packages/common/src/models/
├── SocialConnection.js
├── SocialSource.js
├── SocialFeed.js
└── SocialItemSnapshot.js       # Gerekirse / provider politikasına göre

apps/api/src/modules/social/
├── providerRegistry.js
├── socialService.js
├── connectionService.js
├── feedService.js
├── credentialService.js
├── normalization.js
├── cache.js
└── providers/
    ├── googlePlaces.js
    ├── googleBusinessProfile.js
    ├── instagram.js
    └── facebookPages.js

apps/api/src/routes/
└── social.js

apps/admin/src/pages/social/
├── SocialOverview.jsx
├── SocialConnections.jsx
├── SocialSources.jsx
└── SocialFeeds.jsx

apps/admin/src/lib/api/
└── social.js
```

Provider sayısı ve modül bağımsızlığı arttığında `apps/api/src/modules/social` ayrı bir workspace paketine taşınabilir. İlk fazda gereksiz paket sınırları oluşturulmayacaktır.

## 9. Provider Adapter Sözleşmesi

Her adapter aşağıdaki davranışların desteklediği bölümünü uygular:

```js
{
  key,
  authProvider,
  capabilities,

  validateConfiguration(input),
  testConnection(context),
  discoverSources(context),
  fetchItems(context, query),
  normalizeSource(rawSource),
  normalizeItem(rawItem),
  refreshCredentials(context)
}
```

### Kurallar

- Adapter doğrudan route katmanından çağrılmaz.
- Tenant ve feature kontrolü adapter'a gelmeden tamamlanır.
- Credential yalnızca server-side adapter context içinde çözülür.
- Adapter raw credential veya token loglamaz.
- Provider hataları ortak hata kodlarına çevrilir ancak teşhis için güvenli provider metadata'sı korunur.
- Adapter'ın desteklemediği özellik capability listesinde yer almaz.

## 10. Veri Modeli

### 10.1 SocialConnection

```js
{
  tenantId,
  provider,             // meta | google
  authStrategy,         // api_key | oauth2
  name,
  status,               // pending | connected | expiring | expired | error | disabled
  enabled,
  encryptedCredentials,
  grantedScopes: [],
  expiresAt,
  lastValidatedAt,
  lastRefreshAt,
  lastErrorCode,
  lastErrorAt,
  createdBy,
  updatedBy,
  createdAt,
  updatedAt
}
```

Credential alanı varsayılan sorgularda seçilmez. API yalnızca `hasCredentials`, `expiresAt`, `status` ve güvenli bağlantı metadata'sı döndürür.

### 10.2 SocialSource

```js
{
  tenantId,
  connectionId,
  provider,             // instagram | facebook_pages | google_places | google_business_profile
  externalId,
  type,                 // account | page | place | location
  name,
  username,
  profileUrl,
  avatarUrl,
  enabled,
  capabilities: [],
  providerMetadata,
  lastSyncedAt,
  createdAt,
  updatedAt
}
```

`providerMetadata` yalnızca gizli olmayan ve source davranışı için gereken değerleri içerir.

### 10.3 SocialFeed

```js
{
  tenantId,
  name,
  slug,
  status,               // draft | published | archived
  sourceIds: [],
  kinds: [],
  limit,
  sort,                 // published_desc | source_order
  public,
  cacheTtlSeconds,
  staleIfErrorSeconds,
  createdBy,
  updatedBy,
  createdAt,
  updatedAt
}
```

Unique index: `{ tenantId, slug }`.

### 10.4 SocialItemSnapshot

Kalıcı veya yarı kalıcı cache modeline ancak provider kullanım şartları incelendikten sonra geçilecektir. İlk sürüm için Redis veya kısa ömürlü cache tercih edilir.

Snapshot gerekiyorsa minimum alanlar tutulur:

```js
{
  tenantId,
  sourceId,
  externalId,
  kind,
  normalizedItem,
  providerUpdatedAt,
  fetchedAt,
  expiresAt
}
```

## 11. Ortak Item Sözleşmesi

```json
{
  "id": "instagram:media:17890000000000000",
  "provider": "instagram",
  "kind": "image",
  "source": {
    "id": "source-id",
    "externalId": "17840000000000000",
    "name": "ContextHub",
    "username": "contexthub"
  },
  "author": {
    "id": null,
    "displayName": "ContextHub",
    "username": "contexthub",
    "avatarUrl": null
  },
  "text": "Gönderi açıklaması",
  "media": [
    {
      "type": "image",
      "url": "https://provider.example/media.jpg",
      "thumbnailUrl": null,
      "width": null,
      "height": null,
      "altText": null
    }
  ],
  "rating": null,
  "metrics": {
    "likes": null,
    "comments": null,
    "views": null
  },
  "permalink": "https://provider.example/item",
  "publishedAt": "2026-07-18T10:00:00.000Z",
  "updatedAt": null,
  "fetchedAt": "2026-07-18T10:05:00.000Z",
  "attribution": {
    "label": "Instagram",
    "url": "https://instagram.com"
  },
  "extensions": {}
}
```

### Normalizasyon İlkeleri

- Bulunmayan alanlar `null` veya boş liste olur; sahte varsayımlar üretilmez.
- `id`, provider ve external ID kullanılarak kararlı biçimde oluşturulur.
- `publishedAt` ISO 8601 UTC olarak döndürülür.
- Media listesi sırasını korur.
- Provider'a özgü ama değerli alanlar `extensions` altında tutulabilir.
- Public yanıtta raw provider response döndürülmez.
- Provider attribution ve kullanım şartlarının gerektirdiği bağlantılar korunur.

## 12. Feature Flag ve Erişim Kontrolü

### 12.1 Feature Flag

İlk feature flag:

```js
{
  key: 'ctxhubSocial',
  label: 'ContextHub Social',
  description: 'Sosyal medya ve işletme yorum kaynaklarını bağlama ve feed olarak servis etme özelliği.',
  defaultEnabled: false
}
```

İhtiyaç oluşursa kontrollü provider rollout'u için aşağıdaki alt bayraklar eklenebilir:

```text
socialInstagram
socialFacebook
socialGoogle
```

Alt bayraklar MVP için zorunlu değildir. Provider'ın bağlı ve aktif olması zaten tenant seviyesinde ikinci kontrol sağlar.

### 12.2 Görünürlük Kuralı

```text
ctxhubSocial açık
AND kullanıcı gerekli yetkiye sahip
AND provider sistemde etkin
AND connection aktif ve geçerli
AND source etkin
= veri erişilebilir
```

Admin menüsünü gizlemek tek başına yeterli değildir. Bütün `/social` admin ve public feed route'ları server-side feature guard kullanacaktır.

### 12.3 Önerilen Yetkiler

```text
SOCIAL_VIEW
SOCIAL_MANAGE
SOCIAL_CONNECTIONS_MANAGE
SOCIAL_FEEDS_MANAGE
```

İlk geliştirme fazında mevcut izinlerle geçici eşleştirme yapılabilir:

- Okuma: `CONTENT_VIEW`
- Connection/feed yönetimi: `TENANTS_MANAGE`

Ancak production öncesi ayrı sosyal izinlerine geçilmesi hedeflenir.

## 13. API Taslağı

### 13.1 Admin API

```http
GET    /api/social/providers
GET    /api/social/connections
POST   /api/social/connections
GET    /api/social/connections/:id
PUT    /api/social/connections/:id
DELETE /api/social/connections/:id
POST   /api/social/connections/:id/test
POST   /api/social/connections/:id/refresh

GET    /api/social/oauth/:provider/start
GET    /api/social/oauth/:provider/callback

GET    /api/social/sources
POST   /api/social/connections/:id/discover-sources
PUT    /api/social/sources/:id

GET    /api/social/items

GET    /api/social/feeds
POST   /api/social/feeds
GET    /api/social/feeds/:id
PUT    /api/social/feeds/:id
DELETE /api/social/feeds/:id
POST   /api/social/feeds/:id/preview
```

### 13.2 Public/API Token Tüketimi

```http
GET /api/public/social/feeds/:slug
```

Tenant çözümleme mevcut ContextHub kalıbını izler:

- Public erişimde `X-Tenant-ID` veya `?tenantId=`
- API token kullanılıyorsa `Authorization: Bearer ctx_<token>`

Public endpoint yalnızca aşağıdaki şartlarda veri döndürür:

- Tenant için `ctxhubSocial` açıktır.
- Feed `published` durumundadır.
- Feed `public: true` olarak işaretlenmiştir veya geçerli API token sunulmuştur.
- Feed içindeki source ve connection'lar aktiftir.

### 13.3 Örnek Feed Yanıtı

```json
{
  "feed": {
    "slug": "homepage-social",
    "name": "Ana Sayfa Sosyal Akışı"
  },
  "items": [],
  "pageInfo": {
    "nextCursor": null,
    "hasNextPage": false
  },
  "meta": {
    "fetchedAt": "2026-07-18T10:05:00.000Z",
    "cached": true,
    "stale": false,
    "partial": false,
    "providers": ["instagram", "facebook_pages", "google_places"]
  },
  "warnings": []
}
```

Bir provider başarısız olurken diğerleri başarılıysa tüm feed'i düşürmek yerine `partial: true` ve güvenli warning kodları döndürülür.

## 14. Admin Deneyimi

### 14.1 Navigasyon

`ctxhubSocial` kapalıysa “Sosyal” menüsü hiç gösterilmez. Açık olduğunda önerilen navigasyon:

```text
Sosyal
├── Genel Bakış
├── Bağlantılar
├── Kaynaklar
└── Feed'ler
```

### 14.2 Bağlantı Akışı

1. Kullanıcı provider seçer.
2. API key provider'ında key ve gerekli source bilgilerini girer; OAuth provider'ında yönlendirme akışını başlatır.
3. Backend credential'ı doğrular.
4. Connection güvenli biçimde kaydedilir.
5. Sistem kullanılabilir source'ları keşfeder.
6. Kullanıcı kullanacağı source'ları etkinleştirir.
7. Kullanıcı bir feed oluşturur ve önizler.
8. Feed yayınlanır.

### 14.3 Connection Durumları

UI aşağıdaki durumları açıkça göstermelidir:

- Bağlı
- Test bekliyor
- Token yakında sona eriyor
- Token sona erdi
- Yetki eksik
- Rate limit bekleniyor
- Provider hatası
- Kullanıcı tarafından devre dışı

Credential değeri kaydedildikten sonra tekrar gösterilmez. Kullanıcı yalnızca değiştirme veya kaldırma işlemi yapabilir.

## 15. Credential ve Güvenlik Modeli

- API key, access token, refresh token ve app secret değerleri istemciye geri dönmez.
- Credential'lar AES-256-GCM benzeri authenticated encryption ile şifrelenir.
- Mevcut `SMTP_SECRET_KEY` kullanımına bağlı yardımcı genelleştirilerek sosyal credential'lar için ayrı bir anahtar kullanılmalıdır.
- Önerilen ortam değişkeni: `CREDENTIALS_SECRET_KEY`.
- OAuth callback `state` değeri tenant, kullanıcı ve kısa ömürlü nonce ile doğrulanır.
- OAuth authorization code yalnızca backend tarafından token ile değiştirilir.
- Redirect URI allowlist kullanılır.
- Credential değerleri loglara, hata yanıtlarına veya analytics event'lerine yazılmaz.
- Connection silme işlemi credential ve ilgili cache verilerini temizler.
- Provider yetkisi geri alındığında connection `expired` veya `error` durumuna geçirilir.
- Public endpoint provider tokenını veya raw provider hata mesajını açığa çıkarmaz.
- Bütün modeller tenant scoped çalışır.

## 16. Cache, Senkronizasyon ve Dayanıklılık

### 16.1 MVP Cache Stratejisi

- Read-through cache
- Cache key: tenant + provider + source + query hash
- Varsayılan TTL: 5–15 dakika
- `stale-if-error`: provider'a göre 30–60 dakika
- Provider başına rate limit ve exponential backoff
- Aynı source için eşzamanlı istekleri birleştiren request coalescing

### 16.2 Sonraki Faz

- Zamanlanmış arka plan senkronizasyonu
- Provider destekliyorsa webhook ile cache invalidation
- Token süre sonu uyarıları ve otomatik refresh
- Başarısız sync kayıtları ve tekrar deneme kuyruğu
- Feed ön ısıtma

Provider kullanım şartları saklama süresini sınırlandırıyorsa o provider için yalnızca izin verilen TTL uygulanır.

## 17. Hata Modeli

Önerilen ortak hata kodları:

```text
SOCIAL_FEATURE_DISABLED
SOCIAL_PROVIDER_DISABLED
SOCIAL_CONNECTION_NOT_FOUND
SOCIAL_CONNECTION_INVALID
SOCIAL_CREDENTIALS_MISSING
SOCIAL_CREDENTIALS_EXPIRED
SOCIAL_PERMISSION_MISSING
SOCIAL_SOURCE_NOT_FOUND
SOCIAL_SOURCE_DISABLED
SOCIAL_RATE_LIMITED
SOCIAL_PROVIDER_UNAVAILABLE
SOCIAL_PROVIDER_RESPONSE_INVALID
SOCIAL_FEED_NOT_FOUND
SOCIAL_FEED_NOT_PUBLISHED
SOCIAL_PARTIAL_RESULT
```

Admin yanıtında güvenli teşhis bilgisi verilebilir. Public yanıtta hassas provider ayrıntıları maskelenir.

## 18. Gözlemlenebilirlik

İlk sürümde aşağıdaki metrik ve kayıtlar bulunmalıdır:

- Provider istek sayısı
- Başarı/hata oranı
- Response süresi
- Rate limit sayısı
- Cache hit/miss oranı
- Connection test sonucu
- Credential refresh sonucu
- Son başarılı source sync zamanı
- Feed'in partial response sayısı

Log kayıtlarında tenant ID, provider, connection ID ve güvenli hata kodu bulunabilir; credential veya dış kullanıcıya ait hassas veri bulunamaz.

## 19. Yol Haritası

### Faz 0 — Karar ve Sözleşme

**Amaç:** Uygulama başlamadan önce değişmesi pahalı olacak sınırları netleştirmek.

- [ ] Bu feature dokümanını onaylamak.
- [ ] Ortak item sözleşmesini örnek provider payload'larıyla doğrulamak.
- [ ] Provider kullanım şartları ve veri saklama politikalarını kontrol etmek.
- [ ] OAuth callback domain ve ortamlarını belirlemek.
- [ ] Permission isimlerini kesinleştirmek.
- [ ] Public feed erişim politikasını kesinleştirmek.

**Çıkış kriteri:** Model, route ve güvenlik kararları üzerinde uygulamayı engelleyen açık konu kalmaması.

### Faz 1 — Social Core

**Amaç:** Provider bağımsız çekirdek altyapıyı kurmak.

- [ ] `ctxhubSocial` feature flag tanımını eklemek; default kapalı.
- [ ] Server-side `requireFeature('ctxhubSocial')` guard eklemek.
- [ ] Social permission'larını veya geçici permission eşleştirmesini eklemek.
- [ ] `SocialConnection`, `SocialSource` ve `SocialFeed` modellerini eklemek.
- [ ] Genel credential encryption servisini oluşturmak.
- [ ] Provider registry ve adapter contract'ını oluşturmak.
- [ ] Ortak normalizasyon ve hata modelini oluşturmak.
- [ ] Admin ve public route iskeletlerini eklemek.
- [ ] Model, guard, tenant izolasyonu ve credential masking testlerini yazmak.

**Çıkış kriteri:** Sahte provider adapter'ı ile bağlantı, source keşfi, feed preview ve public feed akışının uçtan uca çalışması.

### Faz 2 — Google Places MVP

**Amaç:** En düşük entegrasyon maliyetiyle gerçek provider akışını doğrulamak.

- [ ] Google Places API key connection formu.
- [ ] API key doğrulama/test endpoint'i.
- [ ] Place ID source oluşturma ve doğrulama.
- [ ] Place details ve yorum çekme adapter'ı.
- [ ] Google yorum normalizasyonu.
- [ ] Attribution alanları.
- [ ] Cache, timeout, retry ve rate limit davranışları.
- [ ] Admin preview ve public feed testi.

**Çıkış kriteri:** Feature flag açık bir tenant'ın API key + Place ID ile yorum feed'i yayınlayabilmesi.

### Faz 3 — Meta OAuth Temeli

**Amaç:** Instagram ve Facebook için ortak güvenli OAuth altyapısını kurmak.

- [ ] Meta uygulama ayarlarını ve redirect URI'ları tanımlamak.
- [ ] OAuth start/callback akışı.
- [ ] CSRF `state` doğrulaması.
- [ ] Token exchange ve şifreli saklama.
- [ ] Scope kaydı ve eksik izin tespiti.
- [ ] Token süresi takibi.
- [ ] Uzun ömürlü token refresh işi.
- [ ] Disconnect/revoke davranışı.
- [ ] OAuth güvenlik ve callback testleri.

**Çıkış kriteri:** Tenant'ın Meta bağlantısı kurabilmesi, bağlantının doğrulanması ve erişilebilir source adaylarının alınabilmesi.

### Faz 4 — Instagram

**Amaç:** Profesyonel Instagram hesaplarını ContextHub feed'lerine bağlamak.

- [ ] Instagram profesyonel hesap source keşfi.
- [ ] Medya listesi ve pagination.
- [ ] Image/video/carousel/reel normalizasyonu.
- [ ] Thumbnail ve permalink desteği.
- [ ] Capability'ye göre açıklama ve metrics alanları.
- [ ] Admin source preview.
- [ ] Feed içinde sıralama ve limit davranışları.
- [ ] Token expiry ve eksik scope durumlarının UI'da gösterimi.

**Çıkış kriteri:** Tenant'ın bağlı profesyonel Instagram hesabından yayınlanmış bir feed oluşturabilmesi.

### Faz 5 — Facebook Pages

**Amaç:** Meta bağlantısından yönetilen Facebook sayfalarını bağlamak.

- [ ] Yönetilen Page source keşfi.
- [ ] Page access yetkisi ve token davranışları.
- [ ] Sayfa gönderileri ve pagination.
- [ ] Attachment, image ve video normalizasyonu.
- [ ] Permalink ve mevcut metrics alanları.
- [ ] Instagram + Facebook birleşik feed testi.

**Çıkış kriteri:** Aynı feed'in Instagram ve Facebook kaynaklarını ortak sözleşmeyle birleştirebilmesi.

### Faz 6 — Feed Yönetimi ve Ürünleştirme

**Amaç:** Teknik entegrasyonu yönetilebilir bir ürün deneyimine dönüştürmek.

- [ ] Bağlantılar, kaynaklar ve feed'ler admin ekranları.
- [ ] Feed preview, provider/source filtreleri ve sıralama.
- [ ] Connection sağlık durumu paneli.
- [ ] Partial result ve stale cache bildirimleri.
- [ ] Tema entegrasyon örneği.
- [ ] API dokümantasyonu ve örnek payload'lar.
- [ ] Audit log kayıtları.

**Çıkış kriteri:** Teknik müdahale olmadan tenant yöneticisinin bağlantı kurup feed yayınlayabilmesi.

### Faz 7 — Google Business Profile

**Amaç:** Google Places'ın 5 yorum sınırını aşan, yetkili işletme yönetimi akışını sağlamak.

- [ ] Google OAuth bağlantısı.
- [ ] Business Profile hesap/lokasyon keşfi.
- [ ] Yorum listesi ve pagination.
- [ ] Incremental sync stratejisi.
- [ ] Provider veri saklama ve gösterim politikalarının uygulanması.
- [ ] Places ve Business Profile source'larının UI'da açıkça ayrılması.

**Çıkış kriteri:** Yetkili tenant'ın yönetilen lokasyon yorumlarını sayfalı ve güvenli biçimde servis edebilmesi.

### Faz 8 — Genişleme ve Operasyon

**Amaç:** Yeni provider'lar ve production ölçek ihtiyaçları için sistemi olgunlaştırmak.

- [ ] Webhook destekleyen provider'lar için event ingestion.
- [ ] Sync kuyruğu, retry ve dead-letter görünürlüğü.
- [ ] Per-provider kota ve kullanım metriği.
- [ ] Feed pre-warming.
- [ ] Yeni provider geliştirme rehberi.
- [ ] Provider contract test paketi.
- [ ] YouTube/TikTok/LinkedIn öncelik değerlendirmesi.

## 20. Test Stratejisi

### Unit Testler

- Provider normalizer'ları
- Capability kontrolleri
- Feature guard
- Permission guard
- Credential encrypt/decrypt ve masking
- Feed merge, sort ve limit davranışı
- Hata normalizasyonu

### Integration Testler

- Tenant izolasyonu
- Connection CRUD
- OAuth callback state doğrulaması
- Source discovery
- Provider timeout ve rate limit davranışı
- Cache hit/miss/stale akışı
- Public feed erişim kuralları
- Partial provider failure

### Contract Testler

Her provider fixture'ı ortak item şemasından geçirilir. Provider payload değişiklikleri fixture ve schema testleriyle yakalanır.

### Güvenlik Testleri

- Feature kapalıyken bütün social route'larının reddedilmesi
- Başka tenant'ın connection/source/feed verisine erişilememesi
- Credential alanlarının hiçbir response'ta görünmemesi
- OAuth state replay ve tenant değiştirme denemeleri
- Loglarda token/key sızıntısı bulunmaması

## 21. Kabul Kriterleri

MVP aşağıdaki şartlar sağlandığında tamamlanmış kabul edilir:

- `ctxhubSocial` varsayılan olarak kapalıdır.
- Feature kapalı tenant menüyü ve social API'lerini kullanamaz.
- Yetkisiz kullanıcı connection oluşturamaz veya credential değiştiremez.
- Credential şifreli saklanır ve okuma yanıtına geri dönmez.
- Google Places connection test edilebilir.
- En az bir Place ID source olarak eklenebilir.
- Google yorumları ortak item formatında döner.
- Tenant bir feed oluşturup yayınlayabilir.
- Public feed yalnızca açıkça yayınlanan ve public işaretlenen feed için çalışır.
- Provider geçici olarak erişilemezse izin verilen süre boyunca stale cache dönebilir.
- Tenant izolasyonu ve feature guard için otomatik testler vardır.

Instagram/Facebook fazı aşağıdaki şartlarla tamamlanır:

- Meta OAuth güvenli biçimde tamamlanır.
- Token şifreli saklanır ve süresi takip edilir.
- Instagram profesyonel hesabı ve Facebook sayfası source olarak keşfedilir.
- Her iki provider ortak item formatında veri döndürür.
- Tek feed iki provider'ın öğelerini birleştirebilir.

## 22. Riskler ve Önlemler

### Provider API ve İzin Değişiklikleri

**Risk:** Meta veya Google izinleri, endpoint'leri ve review süreçleri değişebilir.

**Önlem:** Provider kodunu adapter sınırında tutmak, API sürümünü açıkça tanımlamak ve contract fixture testleri kullanmak.

### Rate Limit ve Maliyet

**Risk:** Sık public feed çağrıları kota veya maliyet oluşturabilir.

**Önlem:** Field mask, cache, request coalescing, feed TTL ve provider bazlı kota metrikleri.

### Token Süre Sonu

**Risk:** Feed'ler fark edilmeden veri üretmeyi durdurabilir.

**Önlem:** Connection health durumu, otomatik refresh, süre sonu uyarısı ve admin bildirimleri.

### Ortak Formatın Veri Kaybettirmesi

**Risk:** En düşük ortak payda yaklaşımı değerli provider alanlarını silebilir.

**Önlem:** Ortak base schema + capability listesi + kontrollü `extensions` alanı.

### Provider İçeriğinin Saklanması

**Risk:** Uzun süreli snapshot saklama provider şartlarıyla çelişebilir.

**Önlem:** MVP'de kısa TTL cache, provider bazlı retention politikası ve kalıcı snapshot öncesi politika incelemesi.

### Credential Sızıntısı

**Risk:** API key veya OAuth tokenın response, log veya hata mesajına karışması.

**Önlem:** Ayrı credential servisi, default `select: false`, redaction, response schema ve güvenlik testleri.

## 23. Açık Kararlar

Uygulamaya başlamadan önce aşağıdaki kararlar kesinleştirilmelidir:

1. Public sosyal feed'ler tamamen anonim erişilebilir mi, yoksa production'da API token zorunlu mu olacak?
2. `SOCIAL_*` permission'ları ilk fazda mı eklenecek, geçici mevcut izinler mi kullanılacak?
3. Feed öğeleri yalnızca read-through cache'te mi kalacak, arama/filtreleme için kısa ömürlü snapshot tutulacak mı?
4. Provider app credential'ları platform seviyesinde mi olacak, tenant kendi Meta/Google uygulamasını tanımlayabilecek mi?
5. Google Business Profile ilk release kapsamına mı alınacak, yoksa Places MVP sonrasına mı bırakılacak?
6. Instagram ve Facebook için webhook desteği ilk Meta fazında mı, sonraki operasyon fazında mı yapılacak?
7. Provider kaynaklı media URL'leri doğrudan mı servis edilecek, kullanım şartları izin verirse R2 proxy/cache katmanı kullanılacak mı?

## 24. Önerilen İlk Uygulama Dilimi

İlk geliştirme PR'ı yalnızca Social Core iskeletini içermelidir:

1. `ctxhubSocial` feature flag.
2. Server-side feature guard.
3. Social permission kararının uygulanması.
4. `SocialConnection`, `SocialSource`, `SocialFeed` modelleri.
5. Credential service.
6. Provider registry ve fake adapter.
7. Route iskeleti.
8. Tenant izolasyonu, feature guard ve credential masking testleri.

Bu dilim gerçek provider bağımlılığı olmadan mimariyi doğrular. İkinci PR Google Places adapter'ını ekler. Meta OAuth, Instagram ve Facebook ayrı ve gözden geçirilebilir PR'lara bölünür.

## 25. Resmî Provider Referansları

- [Google Places Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Google Places REST Place kaynağı](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places)
- [Google Business Profile review verileri](https://developers.google.com/my-business/content/review-data)
- [Google Business Profile genel bakış](https://developers.google.com/my-business/content/overview)
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started)
- [Instagram Business Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login)
- [Instagram Media referansı](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media)
