# F0 – Altyapı & İskele Issue List

Bu belge, **F0 (Altyapı & İskele)** aşamasında açılması gereken GitHub issue'larının bir listesini ve her bir issue için kabul kriterlerini içerir.  Amaç, junior geliştiricilerin bile rahatlıkla anlayabileceği kadar detaylı yönergeler sunmaktır.  Bu aşama yaklaşık **1–1.5 hafta** sürecek olup, temel monorepo yapısı, CI, çevresel değişken yönetimi, Fastify API iskeleti, JWT kimlik doğrulaması, RBAC ve tenant/domain bağlamlarının kurulmasına odaklanır.

Her issue'da **açıklama**, **yapılacak adımlar**, **kabul kriterleri** ve **test önerileri** yer almaktadır.  Issue başlıklarının başında `[F0]` etiketi kullanılmalıdır.

## 📦 [F0] Monorepo ve pnpm yapılandırması

**Açıklama:**
Bu issue, projenin pnpm ile monorepo yapısını oluşturmayı ve temel dizinlerin (apps, packages) hazırlanmasını kapsar.

**Yapılacaklar:**
1. `package.json` dosyasına `workspaces` tanımını ekleyin (`apps/*` ve `packages/*`).
2. `pnpm-workspace.yaml` dosyasını oluşturun ve aynı klasörleri tanımlayın.
3. `apps/api`, `apps/admin` ve `packages/common` klasörlerini oluşturun ve her birine temel `package.json` ekleyin.
4. `pnpm install` komutunu çalıştırarak bağımlılıkları indirin ve workspace bağlantılarını test edin.

**Kabul kriterleri:**
* Root `package.json` ve `pnpm-workspace.yaml` dosyaları tanımlı ve geçerli olmalı.
* `apps/api` ve `packages/common` gibi alt paketler `pnpm list -r` çıktısında görünmelidir.
* `pnpm install` komutu hatasız tamamlanmalıdır.

**Test önerisi:** Terminalde `pnpm workspaces list` komutu çalıştırılarak tüm workspace paketlerinin listelendiği doğrulanabilir.

## 🔧 [F0] CI kurulumu (GitHub Actions)

**Açıklama:**
Projeyi GitHub'a aktardığınızda temel bir CI akışının çalışabilmesi için bir GitHub Actions pipeline'ı tanımlayın. Bu akış, Node.js 18/22 ortamında pnpm kurulumunu, bağımlılıkların indirilmesini ve birim testlerin çalıştırılmasını içerir.

**Yapılacaklar:**
1. `.github/workflows/ci.yml` dosyasını oluşturun.
2. `actions/setup-node` ile Node sürümü 18 ve 22 üzerinde matris halinde çalıştırın.
3. `pnpm`'i kurun (örn. `pnpm/action-setup` kullanabilirsiniz) ve cache mekanizmasını aktifleştirin.
4. `pnpm install` ve `pnpm test` komutlarını çalıştırın.
5. Gelecekte eklenecek `eslint` ve `vitest` raporlarının çıktılarının CI log'larında göründüğünden emin olun.

**Kabul kriterleri:**
* Bir PR açıldığında veya `main` branch'ine push atıldığında CI çalışmalı ve başarılı olmalıdır.
* Akış içinde pnpm cache'i kullanılmalıdır (CI log'larında cache restore/store adımları görülmeli).

**Test önerisi:** PR açarak CI'ın çalıştığı ve status check'in başarıyla geçtiği doğrulanabilir.

## 🌍 [F0] Çevresel değişken yönetimi

**Açıklama:**
Uygulamada kullanılacak çevresel değişkenleri merkezi olarak yönetebilmek için `.env` dosyalarının kullanımını ve örnek dosyanın oluşturulmasını sağlayın.  
`dotenv` paketini entegre ederek uygulamanın bu değişkenleri okumasını sağlayın.

**Yapılacaklar:**
1. Kök dizinde bir `.env.example` dosyası oluşturun.  İçerisine `PORT`, `JWT_SECRET`, `MONGO_URI`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`, `R2_BUCKET` gibi değişkenleri ekleyin.
2. `apps/api` içinde `dotenv` paketini kurun ve server başlatılırken `.env` dosyasını yükleyin.
3. README dosyasında `.env` dosyasının nasıl oluşturulacağına dair talimat ekleyin.

**Kabul kriterleri:**
* `.env.example` dosyasında tüm temel anahtarlar tanımlanmış olmalı.
* API sunucusu ortam değişkenleri eksik olduğunda anlamlı hata mesajları döndürmelidir (örn. JWT_SECRET tanımlı değilse uyarı log'u).

**Test önerisi:** `.env` dosyası olmadan `pnpm dev:api` çalıştırıldığında uygulamanın varsayılan değerleri kullandığı veya anlamlı hatalar verdiği gözlemlenebilir.

## 🚀 [F0] Fastify API iskeleti

**Açıklama:**
`apps/api` paketinin içinde basit bir Fastify sunucusu kurun.  Sağlık kontrolü, JWT eklentisi ve örnek bir login ve korumalı endpoint içersin.  Bu iskelet sonraki fazlarda genişletilecektir.

**Yapılacaklar:**
1. Fastify ve @fastify/jwt bağımlılıklarını kurun.
2. `src/server.js` dosyasında Fastify uygulaması oluşturun; `/health` endpoint'i tanımlayın.
3. `@fastify/jwt` eklentisini kullanarak JWT doğrulama ve token oluşturma işlevlerini ekleyin. Basit bir `/login` endpoint'i ekleyin (kullanıcı adı alıp token döndürsün).
4. Yetkili istekleri kontrol etmek için `app.decorate('authenticate', ...)` fonksiyonunu tanımlayın ve `/protected` gibi bir rotayı korumalı hale getirin.
5. Sunucuyu `PORT` ortam değişkenine göre dinleyecek şekilde yapılandırın ve `npm run dev` ya da `pnpm dev:api` komutuyla başlatılabilmesini sağlayın.

**Kabul kriterleri:**
* `/health` endpoint'i 200 durum kodu ile `{ status: 'ok' }` içeren bir yanıt döndürmelidir.
* `/login` endpoint'i POST isteği ile kullanıcı adını alıp geçerli bir JWT token döndürmelidir.
* `/protected` endpoint'i yetkisiz erişimi `401` ile reddetmeli, yetkili token ile çağrıldığında `200` ile cevap vermelidir.

**Test önerisi:** `vitest` kullanarak üç test yazılabilir: sağlık kontrolünün başarılı olması, yetkisiz `/protected` isteğinin reddedilmesi ve `/login` + yetkili istek akışının başarılı olması.

## 🔑 [F0] JWT kimlik doğrulaması

**Açıklama:**
JWT tabanlı kimlik doğrulamasını modüler bir eklenti olarak yapılandırın.  Gizli anahtar `.env` dosyasından okunmalı ve her token'a kullanıcı kimliği ve rol bilgisi eklenmelidir.  Token doğrulama ve yenileme mekanizmaları ilerleyen aşamalarda eklenecek.

**Yapılacaklar:**
1. `apps/api` içinde `jwt-plugin.js` adında bir dosya oluşturun.  Burada `fastify-plugin` ile JWT eklentisini konfigure edin ve `app.decorate('authenticate', ...)` fonksiyonunu yazın.
2. Token payload'ında kullanıcı kimliği (`sub`) ve rol (`role`) alanlarını saklayın.  Şimdilik rolü sabit (`admin`) olarak verin.
3. Gerekli durumlarda JWT süresini (`expiresIn`) ayarlayın.  Varsayılan olarak 1 saat kullanılabilir.
4. İleride refresh token desteği eklemek üzere not bırakın.

**Kabul kriterleri:**
* JWT eklentisi ayrı bir modülde tanımlanmalı ve `server.js` dosyasında kullanılmalıdır.
* Tokenlar `.env` dosyasındaki gizli anahtar ile imzalanmalı ve doğrulama hataları 401 döndürmelidir.

**Test önerisi:** Korumalı bir endpoint'e geçerli ve geçersiz token ile istek atarak doğru durum kodlarının döndüğünü doğrulayın.

## 🛂 [F0] Rol tabanlı yetkilendirme (RBAC) temelleri

**Açıklama:**
İlk sürümde basit bir RBAC kontrolü uygulayın.  Kullanıcının token'ındaki rol bilgisine göre belirli rotalara erişimini sınırlandırın.  İlerleyen fazlarda kapsamlar (scopes), domain bazlı rollendirme ve ABAC kuralları eklenecektir.

**Yapılacaklar:**
1. Bir `roles.js` veya benzeri modül oluşturarak rol sabitlerini (`owner`, `admin`, `editor`, `author`, `viewer`) tanımlayın.
2. Korumalı rotaları çağırmadan önce bir `requireRole(allowedRoles)` middleware'i yazın ve token içerisindeki `role` alanını kontrol edin.
3. `/admin-only` gibi bir örnek endpoint ekleyerek sadece `admin` rolündeki kullanıcıların erişebildiğini gösterin.

**Kabul kriterleri:**
* Rol sabitleri merkezi bir dosyada tanımlı olmalı.
* `requireRole` fonksiyonu yetkisiz erişimleri 403 hatasıyla döndürmeli.

**Test önerisi:** `admin` rolü ile `/admin-only` endpoint'inin 200 döndürdüğü, farklı bir rol ile 403 döndürdüğü test edilmelidir.

## 🏢 [F0] Tenant ve domain bağlamı

**Açıklama:**
Sistemin çok kiracılı yapısı için temel tenant ve domain modellerini oluşturun.  Bir domain üzerinden gelen isteğin hangi tenant'a ait olduğunu belirleyen bir middleware yazın.  Şimdilik veritabanı yerine basit bir `in‑memory` kayıt veya statik dizi kullanılabilir.

**Yapılacaklar:**
1. `packages/common` altında `tenant.js` dosyası oluşturun; tenant ve domain yapıları için basit JS sınıfları veya JSON nesneleri tanımlayın.
2. İstek geldiğinde `Host` başlığına bakarak domain'i bulacak ve uygun `tenantId`'yi `request` objesine ekleyecek bir Fastify dekoratörü veya hook'u yazın.
3. `/tenants/me` gibi bir endpoint ekleyerek mevcut domain'in hangi tenant'a karşılık geldiğini JSON olarak döndürün.

**Kabul kriterleri:**
* Domain eşleştirme mantığı ayrı bir modülde tanımlı olmalı ve her istek için çalışmalıdır.
* Tanımlı olmayan domain'ler için anlamlı bir hata döndürülmelidir (örn. 404 veya 400).

**Test önerisi:** Testler, farklı `Host` başlıkları ile yapılan isteklerin doğru tenantId döndürdüğünü ve tanımlı olmayan bir domain ile gelen isteğin hata aldığını doğrulamalıdır.

## 🧪 [F0] Test altyapısı

**Açıklama:**
Projede kullanılacak test çerçevesini (örneğin `vitest`) kurun ve örnek testler yazarak test komutunun çalıştığını doğrulayın.  İlerleyen aşamalarda coverage raporu ve CI entegrasyonu yapılacaktır.

**Yapılacaklar:**
1. `vitest`'i root `devDependencies` veya `apps/api` içindeki `devDependencies` olarak ekleyin.
2. Testleri çalıştırmak için kök `package.json`'a `test` script'i ekleyin (örn. `pnpm -r test`).
3. Basit bir test dosyası (örn. `src/server.test.js`) yazarak `/health` endpoint'inin 200 döndürdüğünü kontrol edin.

**Kabul kriterleri:**
* `pnpm test` komutu hiç test hatası olmadan tamamlanmalıdır.
* En az bir örnek test dosyası repository'de bulunmalıdır.

**Test önerisi:** Test betiğini çalıştırarak örnek testin geçtiğini gözlemleyin.  Yanlış bir beklenti yazarak testin kırıldığını görmek, test altyapısının çalıştığını göstermenin iyi bir yoludur.

## 🧹 [F0] Kod biçimlendirme ve linting

**Açıklama:**
Projenin kod kalitesini koruyabilmek için ESLint ve Prettier yapılandırmasını ekleyin.  Her commit öncesinde kodun otomatik olarak formatlanmasını ve lint edilmesini sağlayacak script'ler tanımlayın.

**Yapılacaklar:**
1. `eslint`, `eslint-config-prettier`, `eslint-plugin-node` ve `prettier` paketlerini kurun.
2. Kök dizinde `.eslintrc.cjs` ve `.prettierrc.json` dosyaları oluşturun.  Temel kuralları (örn. AirBnB tabanlı, prettier ile çakışmaları kapatan) tanımlayın.
3. `package.json` içinde `lint` ve `format` script'lerini ekleyin.  `lint` script'i hataları çıkış kodu 0/1 ile göstermeli, `format` ise dosyaları düzenlemelidir.
4. Husky ve lint‑staged gibi araçları ilerleyen aşamada eklemek için not bırakın.

**Kabul kriterleri:**
* `pnpm lint` komutu çalıştırıldığında projenin mevcut durumunda hata vermemelidir.
* Prettier formatlama kuralları tüm JavaScript/TypeScript dosyalarına uygulanabilir olmalıdır.

**Test önerisi:** Kodda stil hatası yapıp `pnpm lint` komutunu çalıştırarak linter'ın hata verdiğini doğrulayın.  Ardından `pnpm format` komutu ile düzelttiğinizde hata kalmamalıdır.

---

Bu aşamadaki tüm issue'lar tamamlandığında proje ayağa kalkabilecek, temel işlevleri testlerle doğrulanmış bir iskelete sahip olacak ve sonraki fazlarda eklenmesi planlanan özellikler için sağlam bir temel oluşturulacaktır.