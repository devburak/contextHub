# Fiyatlandırma, Kota ve İstek Ağırlıklandırma — Uygulama Talimatı

> Durum: **Faz 1 ve billing i18n uygulandı; istek ağırlıklandırma tasarımı feature
> flag arkasında ilerletilmek üzere bekliyor.** Bu belge ticari kararların kod
> karşılığını ve kalan fazları tarif eder.
>
> Son uyum kontrolü: 2026-08-22

> Ürün sınırı: abonelik, kota ve fiyat **tenant başınadır**. Bir tenant bir siteyi
> veya bir sitenin tek dil sürümünü temsil edebilir. Planlar hesap başına 1/5/15
> site ya da tenant hakkı vermez.

İlgili belgeler:

- [`BILLING_BUSINESS_PLAN.md`](./BILLING_BUSINESS_PLAN.md) — fiyat tablosunun kaynağı (§5.5, §5.8)
- [`API_USAGE_METERING_PLAN.md`](./API_USAGE_METERING_PLAN.md) — ölçümün bugünkü hâli
- [`ACCOUNT_LAYER_PLAN.md`](./ACCOUNT_LAYER_PLAN.md) — hesap/fatura katmanı (bu iş ondan bağımsız ilerleyebilir)
- [`OPEN_CORE_AND_EXTENSIONS_PLAN.md`](./OPEN_CORE_AND_EXTENSIONS_PLAN.md) — açık çekirdek sınırı, entitlement katmanı

---

## 1. Verilen üç karar

1. **Kullanıcı ve owner limitleri korunur — ve nihayet uygulanır.** Free 1 kullanıcı,
   Pro 5, Pro Max sınırsız; owner sırasıyla 1 / 2 / 5. Kesin değerler ve gerekçe:
   [`PRICING_PACKAGES.md`](./PRICING_PACKAGES.md) §2 ve §10.
   *(2026-08-21'de kısa süre "kullanıcı limiti kaldırılsın" kararı alınmış, 2026-08-22'de
   geri alınmıştır. Bu belgenin eski §3'ü buna göre yeniden yazıldı.)*
2. **İstek kotası merdiveni değişmiyor.** `BILLING_BUSINESS_PLAN.md` §5.5'teki tablo
   geçerlidir: tenant başına **1.000 / 50.000 / 150.000** istek, havuzlanmaz.
3. **Semantic arama sorgusu 5 istek birimi tüketir (N=5).** Ağırlık **plan verisinde**
   tanımlanır (`SubscriptionPlan.requestWeights`), koda gömülmez; plan bazında
   değiştirilebilir (Enterprise'da 1'e çekilebilir).

Bu üç kararın ortak sonucu: **ana sayaç istek birimidir (request unit).** Depolama ve
kullanıcı sayısı ikincil kısıtlar, domain/site sayısı ise hiç ölçülmez. Semantic ayrı
kota açmaz — aynı sayaçtan 5 kat hızlı tüketir.

---

## 2. Bugünkü ölçüm zinciri (değiştirilecek yüzey)

Uygulamaya geçmeden önce zincirin bilinmesi şart; her fazda hangi halkanın
değiştiği buraya referansla anlatılıyor.

| # | Nerede | Ne yapıyor |
|---|---|---|
| 1 | `apps/api/src/middleware/apiLogger.js` | `onResponse`, fire-and-forget: `incrementUsageCounter(tenantId, periodKey, ttl)` |
| 2 | `apps/api/src/lib/localRedis.js` → `incrementUsageCounter` | Redis hash'e `hIncrBy count 1` |
| 3 | `apps/api/src/services/apiUsageSyncService.js` | 4 saatlik periyotları Mongo'ya flush: `ApiUsage.$inc { totalCalls: pending }` |
| 4 | `apps/api/src/services/apiUsageService.js` → `getUsageForRange` | kalıcı (Mongo) + bekleyen (Redis) toplamı |
| 5 | `apiUsageService.refreshMonthlyLimitFlag` | hot path DIŞINDA kota bayrağını yazar (`setRequestLimitFlag`) |
| 6 | `apps/api/src/middleware/requestLimitGuard.js` | hot path: tek Redis GET, `exceeded === true` ise 429 |
| 7 | `apps/api/src/services/tenantSubscriptionService.js` | plan payload'ı, `getEffectiveLimit`, `syncEntitlementState` |

Bilinmesi gereken üç davranış:

- **Kota kapısı bilinçli fail-open.** Redis okunamazsa istek geçer. Bu politika
  değişmiyor; ağırlıklandırma da onu değiştirmez.
- **Kabul edilmiş sapma:** bayrak en fazla bir sync periyodu geç yazılır; kotası
  dolan tenant o ana kadar servis almaya devam eder.
- **`reserveRequestQuota` deprecated'tir**, hot path'te değildir. Yeni çağrı eklenmez.

### 2.1 Kullanıcı limitinin güncel durumu

`limitCheckerService.checkUserLimit` ve `checkOwnerLimit`, davet oluşturulmadan önce
`authService.inviteUser` tarafından çağrılır. Aktif ve bekleyen üyelikler birlikte
sayılır; böylece paralel davetlerle koltuk sınırı aşılamaz. Free tenant daveti API
politikasında ayrıca tamamen kapalıdır.

---

## 3. Faz 1 — Plan tablosunu hizala, kullanıcı limitini uygula (tamamlandı)

**Amaç:** seed değerleri `PRICING_PACKAGES.md` §10 ile birebir aynı olsun ve tabloda
vaat edilen kullanıcı/owner tavanları gerçekten uygulansın.

### 3.1 Seed değerleri

`apps/api/src/lib/defaultSubscriptionPlans.js`:

| slug | price | userLimit | ownerLimit | storageLimit | monthlyRequestLimit |
|---|---:|---:|---:|---:|---:|
| `free` | 0 | 1 | 1 | 500 MB | 1.000 |
| `pro` | 12 | 5 | 2 | 3 GB | 50.000 |
| `promax` | 45 | `null` | 5 | 5 GB | 150.000 |
| `enterprise` | 250 liste çıpası; sözleşmeli | `null` | `null` | `null` | `null` |

`apps/api/src/lib/defaultSubscriptionPlans.js` bu tabloyla uyumludur.
`packages/common/src/models/Tenant.js` varsayılanları da Free ile aynıdır.
Enterprise için `$250` self-service tahsilat tutarı değil, sözleşme görüşmesinde
gösterilen liste çıpasıdır; arayüzde "Sözleşmeli fiyat" olarak sunulur.

### 3.2 `null` tuzağı

`Tenant.getLimit` bilinmeyen anahtarla açıkça `0` döner, tanımlı veya plan kaynaklı
`null` değerleri ise sınırsız olarak korur:

```js
return Object.prototype.hasOwnProperty.call(defaultLimits, limitType)
  ? defaultLimits[limitType]
  : 0;
```

`limitCheckerService` tarafındaki `null | -1 → sınırsız` kontrolü zaten doğru,
değiştirilmez.

### 3.3 Limitin uygulanması

`Membership` yaratan bütün yollar tek bir kapıdan geçer; `checkUserLimit(tenantId)`
membership kaydedilmeden **önce** çağrılır, aşımda `403` + i18n'li mesaj döner:

- `apps/api/src/services/userService.js:46`
- `apps/api/src/services/authService.js:464`, `:868`, `:903`
- `apps/api/src/services/tenantService.js:89` (workspace kurucusu — **muaf**), `:244`

Kurallar:

- Workspace'i kuran ilk owner limitten muaftır; aksi halde Free'de hiç workspace açılamaz.
- Owner'lar kullanıcı sayısına **dahildir**; `checkOwnerLimit` aynı kapıda çalışır.
- Sayım aktif ve bekleyen üyelikleri kapsar.
  `Tenant.currentUsage.userCount` / `ownerCount` alanları güncel tutulmuyor; yalnızca
  gösterim için tazelenir, yetki kararı onlardan verilmez.
- Davet akışında limit davet oluşturulmadan önce kontrol edilir. Aktif ve bekleyen
  üyelikler koltuk tüketir; kabul sırasında da üyelik politikası yeniden doğrulanır.

### 3.4 Plan self-servis açığı (kapatıldı)

`POST /tenants` artık istemci gövdesinden plan kabul etmez ve yeni self-service
tenant'ı sunucu tarafında Free olarak oluşturur. Ücretli plan yalnız doğrulanmış
ödeme/webhook veya Enterprise sözleşme provisioning kaynağıyla etkinleşir.

- Oluşturmada plan sunucu tarafında `free`'ye sabitlenir; gövdedeki `plan` yok sayılır.
- Plan yalnızca ödeme webhook'u, doğrulanmış ticari aktivasyon veya yetkili platform
  yönetimi üzerinden değişir.
- Lansman boyunca bir kullanıcı yalnızca bir self-service tenant oluşturabilir.
  İlave tenant, ayrı abonelik/kurumsal provisioning akışından geçer.

### 3.5 Testler

- `getLimit`/`getEffectiveLimit` `null` için `0` döndürmemeli (regresyon).
- Free workspace'te ikinci kullanıcı daveti `403`; kurucunun kendi membership'i geçer.
- Pro'da 5. kullanıcı geçer, 6. reddedilir; owner 2'yi aşamaz.
- Pro Max'te 50 kullanıcı eklenebilir (sınırsız), owner 5'i aşamaz.
- `POST /tenants { plan: 'promax' }` → oluşan tenant `free`.
- Seed sonrası dört planın değerleri §3.1 tablosuyla birebir aynı.

## 4. Faz 2 — İstek ağırlıklandırma (tasarım hazır, aktivasyon ertelendi)

Bu faz; admin trafiğinin sayılıp sayılmayacağı, PAYG'nin ham çağrı mı birim mi
kullanacağı, semantic add-on ile çifte ücret algısı ve edge cache-hit ölçümü
netleşmeden üretimde etkinleştirilmez. Şema ve sayaç değişiklikleri uygulanırken
`CTXHUB_REQUEST_WEIGHTS_ENABLED=false` varsayılanı korunur.

**Tasarım ilkesi:** eklenti kendi *fiyatını* belirlemez, kendi *maliyet sınıfını*
beyan eder. Sayıyı plan verisi söyler. Böylece ticari karar core + veri tarafında
kalır, açık çekirdek sınırı (`OPEN_CORE_AND_EXTENSIONS_PLAN.md`) korunur: public
core'da `search.semantic = 5` gibi bir sabit **bulunmaz**, yalnızca "ağırlık sınıfı"
mekanizması bulunur.

Zincirdeki üç yeni kavram:

- **usage class** — ölçüm sınıfı, namespaced anahtar (`search.semantic`). Eklenti
  manifest'inde beyan edilir, istek sırasında facade ile işaretlenir.
- **weight** — sınıfın plan bazındaki çarpanı (`SubscriptionPlan.requestWeights`).
- **unit** — ağırlıkla çarpılmış istek. Kota ve fatura artık **unit** sayar,
  ham istek sayısı (`totalCalls`) analitik için ayrı tutulur.

### 4.1 Plan verisi: `requestWeights`

`packages/common/src/models/SubscriptionPlan.js`:

```js
requestWeights: {
  type: Map,
  of: Number,
  default: () => new Map(),
  validate: {
    validator: (map) => Array.from(map.entries()).every(([key, value]) =>
      /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(key) &&
      Number.isInteger(value) && value >= 1 && value <= 100
    ),
    message: 'requestWeights keys must be namespaced identifiers and values integers in [1,100]',
  },
},
```

Kurallar:

- Anahtar deseni `features[]` ile **aynı** olmalı (aynı regex, kopyala-yapıştır değil,
  ortak sabite çıkar: `packages/common/src/models/SubscriptionPlan.js` içinde
  `NAMESPACED_KEY_PATTERN`).
- Değer `1`'den küçük olamaz (ücretsiz istek yaratmaz), `100`'den büyük olamaz
  (yanlış girilmiş bir değer tek istekte kotayı silmesin). Üst sınır sabiti
  `MAX_REQUEST_WEIGHT = 100` olarak export edilir.
- `DEFAULT_SUBSCRIPTION_PLANS` içinde `requestWeights` **boş bırakılır** (`{}`).
  Semantic ağırlığını ticari overlay yazar. Gerekçe: `seedSubscriptionPlans.js`
  zaten `features` alanını mevcut kayıtlarda korumak için `$set`'ten çıkarıyor —
  **`requestWeights` da aynı muameleyi görmeli**:
  ```js
  const corePlanData = { ...planData };
  delete corePlanData.features;
  delete corePlanData.requestWeights;   // ← eklenecek satır
  ```
  Aksi halde her seed çalıştırması ticari ağırlıkları siler. Bu, en kolay gözden
  kaçacak ve en pahalıya patlayacak detaydır.

Ticari overlay seed'i (private repo, `ctxhub-commercial`): `pro` ve `promax`
planlarına `{ 'search.semantic': 5 }` yazar; `enterprise` sözleşmeye göre.

### 4.2 Tenant bazlı override

`packages/common/src/models/Tenant.js` → `customRequestWeights: { type: Map, of: Number, default: undefined }`.
`customLimits`'e **eklenmez** (o şema limit alanlarıyla sabit anahtarlı; ağırlıklar dinamik).

`tenantSubscriptionService`'e:

```js
async getEffectiveRequestWeight(tenant, usageClass) {
  const custom = tenant?.customRequestWeights?.get?.(usageClass);
  if (Number.isInteger(custom) && custom >= 1) return custom;
  const payload = await this.getPlanPayloadForTenant(tenant);
  const planWeight = payload.requestWeights?.[usageClass];
  return Number.isInteger(planWeight) && planWeight >= 1 ? planWeight : 1;
}
```

**Varsayılan her zaman 1'dir.** Sınıf tanımsızsa, plan verisi eksikse, Mongo
okunamazsa → 1. Ağırlık mekanizması hiçbir koşulda isteği reddetmez veya hata atmaz.

`buildPlanPayload` çıktısına `requestWeights` eklenir (`limits`'in yanına, içine değil):

```js
return {
  id, slug, name, description, price, billingType, features,
  limits: { users, owners, storage, requests },
  requestWeights: Object.fromEntries(source.requestWeights ?? []),
};
```

Bu payload tenant cache'ine ve edge KV'ye giden yapıdır; `syncEntitlementState`
çağrıldığında ağırlık değişikliği de otomatik yayılır — ayrı bir yayma yolu yazılmaz.

### 4.3 İstek başına ağırlığın taşınması: `request.usageWeight`

Sözleşme:

- Varsayılan: alan yok → ağırlık 1.
- Yazma noktası **yalnızca** eklenti route'unun handler'ı veya `preHandler`'ıdır.
- Core route'ları ağırlık yazmaz.
- Bir istek için ağırlık **bir kez** yazılır; ikinci yazma denemesi log'lanır ve
  **en büyüğü** kazanır (yanlışlıkla düşürme mümkün olmasın).

Core'a yeni facade — `apps/api/src/lib/extensionUsageFacade.js`:

```js
function createExtensionUsageFacade(manifest, { resolveWeight }) {
  const declared = new Set(manifest.usageClasses || []);
  return Object.freeze({
    async charge(request, usageClass) {
      if (!declared.has(usageClass)) {
        throw new ExtensionApiError(
          `usage class '${usageClass}' is not declared by ${manifest.name}`,
          'EXTENSION_USAGE_CLASS_NOT_DECLARED'
        );
      }
      const weight = await resolveWeight(request, usageClass); // tenant + plan
      request.usageWeight = Math.max(request.usageWeight ?? 1, weight);
      request.usageClass = usageClass;
      return weight;
    },
  });
}
```

- Manifest'te beyan edilmemiş sınıf **reddedilir** — bir eklenti başka bir eklentinin
  ağırlık sınıfını kullanamaz.
- `resolveWeight` çözülemezse (Mongo/Redis hatası) `1` döner, istek akışı bozulmaz;
  hata `context.log.warn` ile kısılarak loglanır.

`apps/api/src/lib/extensionApi.js` → `createExtensionApi` içine `usage:
createExtensionUsageFacade(manifest, ...)` eklenir.

`apps/api/src/lib/extensionContract.js` → `EXTENSION_API_REVISION` **5 → 6**.
Değişiklik **additive**'dir: revision 4/5 bekleyen mevcut eklentiler çalışmaya
devam eder (`usage` facade'ını kullanmazlar). `ADMIN_EXTENSION_API_REVISION`
değişmez.

Manifest şeması: doğrulama `apps/api/src/lib/pluginHost.js` içindeki manifest
normalizasyonunda yapılır (`featureKeys` / `capabilities` ile aynı yer, ~satır 143):
`usageClasses: string[]`, opsiyonel, namespaced desen, en fazla 16 eleman,
`uniqueStrings` ile tekilleştirilir.

### 4.4 Eklenti tarafı (ctxhub-commercial, private repo)

`plugins/semantic-search/plugin.manifest.json`:

```json
"apiRevision": 6,
"usageClasses": ["search.semantic"]
```

`plugins/semantic-search/api/src/plugin-runtime.mjs`:

- `REQUIRED_EXTENSION_REVISION = 4` → `6`.
- `POST /query` handler'ında, **query worker çağrılmadan önce**:
  ```js
  await context.usage.charge(request, 'search.semantic');
  ```
- `GET/PUT /policy` ve indeksleme yolları **ağırlıklandırılmaz** (bkz. §4.8).
- Ağırlık, sorgu **başarısız olsa bile** düşer mi? **Hayır** — `charge` çağrısı
  handler'ın başındadır ama sayım `onResponse`'ta yapılır; 5xx dönen isteklerde
  `apiLogger` zaten sayıyor. Politika kararı: **5xx dönen semantic sorgu 1 birim
  sayılır, 5 değil.** Uygulaması: `charge`'ı `queryClient.query()` başarıyla
  dönd*ükten sonra* çağır. Bu satırın yeri önemlidir, yorumla işaretlensin.

### 4.5 Sayaç: Redis

`apps/api/src/lib/localRedis.js` → `incrementUsageCounter(tenantId, periodKey, ttl, weight = 1)`:

```js
const safeWeight = Number.isInteger(weight) && weight >= 1 ? Math.min(weight, MAX_REQUEST_WEIGHT) : 1;
const replies = await this.client.multi()
  .hIncrBy(key, 'count', 1)          // ham istek — analitik
  .hIncrBy(key, 'units', safeWeight) // ağırlıklı birim — kota ve fatura
  .hSet(key, { periodKey, updatedAt: now })
  .expire(key, ttl)
  .exec();
```

`getUsageCounter` çıktısı genişler:

```js
{
  count, units, flushed, flushedUnits,
  pending: max(0, count - flushed),
  pendingUnits: max(0, units - flushedUnits),
  updatedAt, flushedAt,
}
```

**Geriye uyumluluk (deploy anında yaşayan anahtarlar):** `units` alanı yoksa
`units = count`, `flushedUnits` yoksa `flushedUnits = flushed` kabul edilir.
Bu, deploy sırasında açık olan 4 saatlik periyotların kaybolmasını engeller ve
tek satırlık bir `??` ile çözülür — testi yazılsın.

`setUsageFlushedCount(tenantId, periodKey, flushedCount, ttl)` (satır 347) → imzası
`(tenantId, periodKey, { count, units }, ttl)` olarak genişletilir; `flushed` ve
`flushedUnits` aynı `hSet` içinde yazılır. Tek çağıran `apiUsageSyncService`
olduğu için geriye uyumlu overload gerekmez — sayı geçilirse `units = count`
kabul eden bir guard yine de eklensin.

### 4.6 Sayaç: `apiLogger`

`apps/api/src/middleware/apiLogger.js`:

```js
const weight = Number.isInteger(request.usageWeight) && request.usageWeight >= 1
  ? request.usageWeight
  : 1;
setImmediate(() => {
  localRedisClient.incrementUsageCounter(tenantId, periodKey, USAGE_KEY_TTL_SECONDS, weight)
    .catch(...);
});
```

Başka hiçbir değişiklik yok. `request.requestLimitExceeded` erken dönüşü aynen kalır
(429 alan istek sayılmaz).

### 4.7 Kalıcı kayıt: Mongo

`packages/common/src/models/ApiUsage.js` → yeni alan:

```js
billableUnits: { type: Number, required: true, default: 0 },
```

`totalCalls` **ham istek sayısı olarak kalır** — analitik dürüstlüğü için. İkisini
tek alana katlamak, "bu ay kaç istek attım" sorusunu cevaplanamaz hâle getirir.

`apps/api/src/services/apiUsageSyncService.js`:

```js
$inc: { totalCalls: counter.pending, billableUnits: counter.pendingUnits },
```

Flush koşulu `counter.pending > 0` yerine `counter.pending > 0 || counter.pendingUnits > 0`
olur. `setUsageFlushedCount` çağrısı yeni imzayla güncellenir. `results.flushedCalls`
korunur, yanına `results.flushedUnits` eklenir.

**Geriye dönük okuma:** `billableUnits` alanı olmayan eski kayıtlar için okuma
tarafında daima `$ifNull: ['$billableUnits', '$totalCalls']` kullanılır. Toplu bir
backfill göçü **yapılmaz** (gereksiz; eski dönemlerde ağırlık zaten 1'di).

### 4.8 Kota hesabı

`apps/api/src/services/apiUsageService.js`:

- `sumPersistedUsageForRange` → aggregate `$sum: { $ifNull: ['$billableUnits', '$totalCalls'] }`.
- `sumPendingUsageForRange` → `counter.pendingUnits` (geriye uyum kuralıyla).
- `resolveRequestLimitState`, `refreshMonthlyLimitFlag`, `getUsageStats` **kod olarak
  değişmez**; artık birim sayarlar. `getUsageStats` çıktısına ham istek sayısını da
  koymak istenirse ayrı alan (`callsMonthly`) eklenir, mevcut alanların anlamı
  değiştirilmez.
- `apps/api/src/middleware/requestLimitGuard.js` **değişmez.**

**Ağırlıklandırılmayan istekler** (weight = 1 kalır):

| Yol | Gerekçe |
|---|---|
| İndeksleme (embedding üretimi + Vectorize yazımı) | §5.8 kararı: ücretli planlarda ücretsiz, kotadan düşmez |
| `/policy` okuma-yazma | yapılandırma, sorgu değil |
| Domain event tüketicileri, kuyruk işleri | tenant isteği değil, sunucu içi iş |
| 5xx dönen semantic sorgu | başarısız işten tam ücret alınmaz (§4.4) |

### 4.9 İstemciye görünürlük

- Yanıt başlığı: `X-RateLimit-Cost: <weight>` — bu isteğin kaç birim tükettiği.
  `onSend` hook'unda yazılır (guard `preHandler`'da çalıştığı için ağırlığı henüz
  bilmez; `apiLogger` ise `onResponse`'ta, başlık yazmak için geç kalır).
- `RateLimit-Policy` / `RateLimit` başlıklarının birimi artık "request unit"tir.
  Format değişmez; anlam `DEVELOPER_DOCS.md` ve `API-TOKEN-USAGE.md`'de yazılır.
- 429 gövdesine `unit: 'request-units'` alanı eklenir; `limit`/`usage` alanları
  aynı isimle kalır.

### 4.10 Kabul edilen sapmalar (belgelenmeli, düzeltilmeye çalışılmamalı)

1. Ağırlık handler'da belirlendiği için kota kapısı **isteğin maliyetini önceden
   bilmez**. Kotasının son 1 biriminde olan bir tenant, 5 birimlik bir semantic
   sorguyu geçirebilir ve dönemi **4 birim aşımla** kapatabilir. Bu, mevcut "bir sync
   periyodu geç" sapmasının yanında ihmal edilebilir.
2. Ölçüm fail-open'dır: Redis yoksa hiçbir şey sayılmaz. Ağırlıklandırma bu politikayı
   değiştirmez. **Fatura kalemi Redis'ten değil, Mongo'daki `billableUnits`'ten üretilir.**

### 4.11 Feature flag ve geri alma

`CTXHUB_REQUEST_WEIGHTS_ENABLED` (varsayılan `false`):

- Kapalıyken `charge()` çağrısı ağırlığı çözer, **loglar**, ama `request.usageWeight`
  yazmaz → her istek 1 birim. Böylece etkisi ölçüm ortamında gözlenebilir.
- Açıldığında geri alma tek env değişikliğidir; veri şeması değişmediği için rollback
  göç gerektirmez (`units`/`billableUnits` alanları zararsız kalır).
- Açılış sırası: staging → tek bir iç tenant → tüm tenant'lar. Açılıştan önce
  müşterilere **30 gün** önceden bildirim (fiyat/kota değişikliği sayılır).

---

## 5. Faz 3 — Arayüz, dokümantasyon, i18n

### 5.1 Admin arayüzü

1. `apps/admin/src/components/SubscriptionPlanSelector.jsx`
   - Kullanıcı/owner satırları kalır; `formatLimit` (satır 54-58) `null` için zaten
     `plan.unlimited` döndürüyor, yani Pro Max "Sınırsız kullanıcı" görünür.
   - Yeni satır: plan `requestWeights` boş değilse dipnot — "Semantic arama sorgusu
     5 istek birimi sayılır."
2. Kullanım ekranı (`apps/admin/src/pages/Dashboard.jsx` ve tenant kullanım görünümü)
   - İki sayı ayrı gösterilir: **İstek** (`totalCalls`) ve **Tüketilen birim**
     (`billableUnits`). Kota çubuğu **birim** üzerinden çizilir.
   - Aradaki fark kullanıcıya açıklanmalı; aksi halde "50.000 kotam vardı, 30.000
     istekte doldu" desteği doğar. Tek cümlelik bir yardım metni yeterli.
3. Fiyatlandırma sayfası (public) — içeriğin tamamı
   [`PRICING_PACKAGES.md`](./PRICING_PACKAGES.md)'den gelir; oradaki §3 birim tablosu
   (`Standart istek = 1 birim`, `Semantic arama = 5 birim`, `İndeksleme = ücretsiz`,
   `Önbellek = sayılmaz`) sayfada ayrı bir kutu olarak durur. Sayfa statiktir; sebebi
   `PRICING_PACKAGES.md` §9'da.

### 5.2 i18n

`contexthub-i18n` konvansiyonu: **düz anahtar, tek namespace**, TR + EN birlikte.
Billing sayfasının bütün görünür metinleri, ülke adları, tarih/para formatları,
plan yetenekleri, ödeme yöntemi ve durum etiketleri `billing.*` anahtarlarıyla
Türkçe ve İngilizce desteklenir.

Fatura profili e-posta, ülkeye duyarlı telefon ve posta kodu kurallarını aynı ortak
sözleşmeyle istemci ve API tarafında doğrular. Hizmet/abonelik koşulları ile fatura
verileri aydınlatması formda ayrı okunur; `ctxhub-cloud-terms-v3` kabul zamanı,
kullanıcı ve sürümle kaydedilir. Aydınlatma metni bir açık rıza talebi değildir.
Hizmet koşulları ve aydınlatma; verilerin Türkiye dışında, AB/AEA ülkeleri dahil
dağıtık bulut, yedekleme, CDN ve edge altyapılarında saklanabileceğini, önbelleğe
alınabileceğini veya işlenebileceğini açıklar. Yurt dışı aktarım, KVKK m.9 kapsamındaki
uygun aktarım mekanizmaları ve gerekli teknik/idari tedbirlerle yürütülür; metin
yalnızca AB/AEA içinde veri yerleşimi garantisi vermez.
Yeni anahtarlar:

- `plan.limit_users_unlimited`, `plan.limit_owners_unlimited`
- `plan.request_weight_note` (değişkenli: `{{class}}`, `{{weight}}`)
- `usage.units`, `usage.raw_calls`, `usage.units_help`
- `error.request_limit_exceeded` mevcut; gövdesindeki "istek" ifadesi "istek birimi"
  olarak güncellenir (backend hata kataloğu ile birlikte).

### 5.3 Dokümantasyon güncellemeleri

| Dosya | Yapılacak |
|---|---|
| `BILLING_BUSINESS_PLAN.md` §5.5 | Tablo tamamen `PRICING_PACKAGES.md` §2 ile değiştirilir: site satırı silinir, fiyat/kullanıcı/depolama/aşım değerleri oradan gelir |
| `BILLING_BUSINESS_PLAN.md` §5.8 | "ayrı semantic kotası yok" kararı korunur, **"semantic sorgu 5 birim sayılır"** cümlesi eklenir |
| `BILLING_BUSINESS_PLAN.md` §10.5 | **Bilinen çelişki**: hâlâ "kota hesap seviyesinde havuzlanmalı" diyor; güncel karar "tenant başına, havuzlanmaz". §10.5 eski karara göre yazılmış — ayrı doküman uyum işinde düzeltilsin |
| `API_USAGE_METERING_PLAN.md` | Birim modeli (count vs units), yeni Redis alanları, `billableUnits`, geriye uyum kuralı |
| `DEVELOPER_DOCS.md`, `API-TOKEN-USAGE.md` | `X-RateLimit-Cost`, birim tanımı, maliyet tablosu |
| `PLUGIN_API.md` | `usage` facade sözleşmesi, `usageClasses` manifest alanı, revision 6 |
| `OPEN_CORE_AND_EXTENSIONS_PLAN.md` | Ağırlık sınıfı mekanizması core'da, ağırlık **değerleri** overlay'de — sınır cümlesi |

---

## 6. Test listesi (vitest)

Faz 1: bkz. §3.5 (seed hizalaması, `null` tuzağı, kullanıcı/owner limitinin
uygulanması, plan self-servis açığı).

Faz 2:

5. `SubscriptionPlan.requestWeights` validasyonu: geçersiz anahtar, `0`, `101`,
   ondalık değer → hata; `{ 'search.semantic': 5 }` → geçerli.
6. `seedSubscriptionPlans` mevcut kaydın `requestWeights`'ini **ezmez** (features
   testinin ikizi).
7. `getEffectiveRequestWeight`: plan verisi, tenant override, tanımsız sınıf → 1,
   Mongo hatası → 1.
8. `buildPlanPayload` çıktısında `requestWeights` düz nesne olarak yer alır.
9. `usage` facade: manifest'te beyan edilmemiş sınıf → `EXTENSION_USAGE_CLASS_NOT_DECLARED`;
   iki kez `charge` → büyük olan kazanır.
10. `incrementUsageCounter(..., 5)` → `count +1`, `units +5`; `weight = 0 | -3 | 'x'`
    → `units +1`; `weight = 999` → `units +100` (üst sınır).
11. `getUsageCounter` geriye uyum: `units` alanı olmayan hash → `units === count`.
12. `syncFourHourUsage`: `billableUnits` doğru `$inc`; yalnızca `pendingUnits > 0`
    olan durumda da flush eder.
13. `sumPersistedUsageForRange`: `billableUnits` olmayan eski kayıtta `totalCalls`
    kullanılır (`$ifNull`).
14. `refreshMonthlyLimitFlag`: 10.000 birim / 10.000 limit → `exceeded: true`
    (ağırlıklı tüketimle kotanın dolduğu uçtan uca senaryo).
15. Feature flag kapalıyken `charge()` `request.usageWeight` yazmaz.
16. `X-RateLimit-Cost` başlığı ağırlıklı yanıtta `5`, normal yanıtta `1`.

Uçtan uca (ctxhub-commercial):

17. `POST /api/plugins/semantic-search/query` başarılı → 5 birim; 5xx → 1 birim;
    `/policy` çağrısı → 1 birim.

**Testler bulut konteynerinde çalıştırılır** (yerel `node_modules` macOS binary'leri
Cowork Linux VM'inde vitest'i açmıyor): `git clone` + `corepack pnpm install` + `pnpm test`.

---

## 7. Faz sıralaması ve tamamlanma ölçütü

| Faz | Kapsam | Bağımlılık | DoD |
|---|---|---|---|
| 1 | Seed'i `PRICING_PACKAGES.md` §10'a hizala + kullanıcı/owner limitini uygula + plan self-servis açığını kapat | yok | Testler yeşil, Free'de ikinci kullanıcı reddediliyor, `POST /tenants {plan}` yok sayılıyor |
| 2a | Core: `requestWeights`, `usage` facade, revision 6, Redis `units`, `billableUnits`, `$ifNull` okuma | Faz 1 | Flag kapalı deploy, üretimde `units == count` gözlendi |
| 2b | Eklenti: `search.semantic` charge, manifest revision | 2a | Staging'de semantic sorgu 5 birim düşüyor |
| 3 | Arayüz, i18n, dokümanlar, müşteri bildirimi | 2b | Fiyat sayfası ve kullanım ekranı birim ayrımını gösteriyor |
| 4 | Flag'i aç (staging → iç tenant → tümü) | 3 + 30 gün bildirim | Kota bayrağı birim üzerinden çalışıyor, destek talebi yok |

Fazlar arasında **veri şeması geriye uyumlu** kalır; her fazın tek başına deploy
edilebilmesi ve geri alınabilmesi şarttır.

---

## 8. Karar bekleyen açık sorular

1. **Kota hangi trafiği sayıyor?** `apiLogger` bugün `/health` dışındaki **bütün**
   istekleri sayıyor — admin panelindeki her tıklama dahil. Ağırlıklandırma bu soruyu
   görünür hâle getiriyor: ajans ekibi paneli kullandıkça müşterinin kotası eriyor.
   *Öneri:* oturum tabanlı admin API çağrıları kotadan düşmemeli (`requestLimitGuard`
   skip listesine benzer bir "sayma" skip listesi); kota **API anahtarıyla gelen
   public/delivery trafiğini** ölçmeli. Bu, tek başına bir karar ve muhtemelen bu
   işten daha büyük etkiye sahip.
2. **PAYG faturası hangi sayaçtan?** Enterprise `$0.10 / 1.000 istek` — bu artık
   1.000 **birim** mi, 1.000 **ham istek** mi? *Öneri:* birim (semantic maliyeti
   zaten ağırlıkta). Aşım fiyatları (§5.5, $2 / $0.50 per 10K) için de aynı cevap
   geçerli olmalı ve fiyat sayfasında "birim" yazmalı.
3. **Semantic add-on ile ağırlık birlikte alınırsa çifte ücret algısı doğar mı?**
   Müşteri hem $19/ay add-on hem 5x kota tüketimi ödüyor. *Öneri:* add-on ile
   birlikte plana **kota hediyesi** (örn. Pro'da +50.000 birim) verilsin ya da
   ağırlık 3'e indirilsin. Ağırlık plan verisinde olduğu için bu karar kod değişikliği
   gerektirmez — sadece seed değeri değişir. Lansmandan önce yanıtlanmalı.
4. **Edge gateway cache-hit'leri sayılıyor mu?** Kenar önbellekten dönen istek
   origin'e ulaşmıyorsa `apiLogger` görmez. Bu bugünkü davranış; kasıtlı mı,
   yoksa gateway'den ölçüm mü beslenmeli? `ctxhub-edge-gateway` ayrı repoda —
   ayrı bir işte netleşsin.
5. **Yeni tenant provisioning:** planlar hesap başına site/tenant adedi vaat etmez.
   Her yeni tenant kendi planı ve ticari aktivasyon kaynağıyla değerlendirilir.
