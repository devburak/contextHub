# WordPress'ten geçiş

ContextHub Migrator, WordPress yazılarını ve ilişkili medyayı WordPress admin içinden ContextHub Cloud'a taşır. Editörlerin dry-run görünürlüğüne, kategori eşlemesine, duplicate-safe content write'a ve devam ettirilebilir medya işlemine ihtiyaç duyduğu aşamalı ajans migrasyonları için tasarlanmıştır.

Migrator, ContextHub Cloud için ayrı geliştirilen public bir WordPress pluginidir. ContextHub community reposunun Node runtime'ının parçası değildir.

## Plugini indirme

- Kaynak kod ve issue takibi: [devburak/contexthub-wp-migrator](https://github.com/devburak/contexthub-wp-migrator)
- Dokümante edilen güncel sürüm: [ContextHub Migrator 2.1.2](https://github.com/devburak/contexthub-wp-migrator/releases/tag/v2.1.2)

WordPress kurulumu için release sayfasındaki `contexthub-migrator-2.1.2.zip` asset'ini indirin. GitHub'ın otomatik oluşturduğu **Source code** arşivlerini plugin kurulumu için kullanmayın.

## Başlamadan önce

- WordPress database ve `wp-content/uploads` yedeğini alın.
- `write` scope'lu, yalnız migrasyona özel ContextHub API token oluşturun. Sonrasında gerekmiyorsa revoke edin.
- Hedef tenant ID'yi kaydedin; başka müşterinin token veya tenant ayarını kullanmayın.
- Post type, taxonomy, custom field, gallery, embed, redirect ve SEO metadata envanteri çıkarın.
- Final cutover öncesinde rollback ve content-freeze penceresi belirleyin.
- Plan storage ve request kotasında migration batch'i için yeterli alan olduğunu doğrulayın.

Yayınlanan plugin paketi PHP 7.4 veya üzerini ister. Kurulumdan önce WordPress minimum sürümünü paket manifestinden doğrulayın.

## Kurulum ve bağlantı

1. WordPress Admin içinde **Plugins → Add New → Upload Plugin** yolunu açın.
2. `contexthub-migrator-2.1.2.zip` release asset'ini yükleyip etkinleştirin.
3. **ContextHub → Settings** sayfasını açın.
4. API URL olarak `https://api.ctxhub.net/api` girin.
5. Migrasyona özel `ctx_` API token'ı ve hedef tenant ID'yi girin.
6. Bağlantıyı test edip kaydedin.

Token `Authorization: Bearer ctx_your_token` olarak gönderilir. Migrasyonu WordPress Admin içinde tutun; token'ı public JavaScript, sayfa kaynağı, log veya ekran görüntüsüne çıkarmayın.

## Eşleme ve dry-run

Her WordPress kategorisini mevcut bir ContextHub kategorisine eşleyin veya açıkça yeni hedef oluşturun. Büyük batch öncesinde duplicate veya belirsiz slug'ları çözün.

Temsilî bir örneklemle başlayın:

1. Heading, liste, link, gallery, featured image, caption, download ve video embed içeren yazıları seçin.
2. **Dry run** seçeneğini etkinleştirin.
3. Dönüştürülemeyen URL'leri, desteklenmeyen markup'ı, kategori seçimlerini ve planlanan media işlemlerini inceleyin.
4. Kaynak veya eşlemeyi düzeltin; rapor kabul kriterlerinize göre yeterince temiz olana kadar tekrarlayın.

Dry-run staging tenant'ın yerini tutmaz. Yüksek riskli migrasyonlarda bütün akışı önce production olmayan tenant üzerinde doğrulayın.

## Migrasyonu çalıştırma

Plugin desteklenen WordPress HTML'ini ContextHub Lexical representation'a dönüştürür ve şunları taşıyabilir:

- Yazılar, başlıklar, slug'lar, publish date, status ve WordPress kaynak metadata'sı.
- Kategoriler ve kategori eşlemeleri.
- Featured image'lar ve yazı gövdesine eklenmiş görseller.
- Lazy-loaded image source'ları, caption, linked file ve media referansları.
- Migrated content ile ilişkili gallery'ler.
- Kurulu plugin sürümünün tanıdığı YouTube/Vimeo ve tema seviyesindeki featured-video metadata'sı.

Sınırlı batch'ler çalıştırın, real-time log'u izleyin ve `429` veya tekrarlayan `5xx` yanıtlarında duraklayın. Client geçici `408`, `429`, network ve `5xx` hatalarını sınırlı backoff ile tekrarlar; fakat plan kotasının tükenmesi reset'i beklemeyi veya plan değişikliğini gerektirir.

## Duplicate ve recovery davranışı

Migrasyonu tekrar çalıştırmak ilgisiz içeriği körlemesine overwrite etmemelidir. Migrator stored ContextHub ID, slug kontrolü ve publish-date pencereleriyle stale eşlemeleri kurtarır; duplicate-safe create veya update kararı verir.

Recovery Mode yalnızca media objelerinin managed storage'da zaten bulunduğu ve tekrar upload yerine register edilmesi gereken bilinen senaryo içindir. Normal ilk migrasyonda açmayın. Daha önce yanlış objeyle eşleşmiş kaynağı yeniden denemeden önce stale media mapping'lerini temizleyin.

## Cutover öncesi doğrulama

- Kaynak ve hedef sayıları status, kategori ve tarih aralığına göre karşılaştırın.
- Her template'ten örnek açıp rich text, link, caption, embed, gallery ve featured media'yı inceleyin.
- Hedef content status'ünü doğrulayın; draft'ları yanlışlıkla publish etmeyin.
- Eski URL'leri doğrulayın ve yeni frontend'e redirect tanımlayın.
- Yeni sitede canonical metadata, structured data, sitemap kapsamı ve social preview'ları kontrol edin.
- Cache invalidation tetikleyip public frontend'in en güncel published veriyi aldığını doğrulayın.
- Migration log'u export edin ve çözülmemiş istisnaları kaydedin.

Kabul sonrasında migration token'ını revoke edin veya scope'unu daraltın, artık gerekmiyorsa plugini kaldırın ve final raporu proje handoff'u ile saklayın.

[Content](./content.md), [Medya](./media.md), [Hatalar ve retry](./errors.md) ve [Kotalar ve kullanım](./quotas.md) ile devam edin.
