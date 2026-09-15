# 🚀 Deploy Quick Start

## Hızlı Kullanım

```bash
# 1. Build al ve deploy et (tek komut)
pnpm deploy

# 2. Canlı/hosted build al
pnpm build:admin:hosted

# 3. Sadece deploy et (build zaten alınmışsa; entitlement ve plugin sözleşmesi yine doğrulanır)
pnpm deploy:admin
```

## Gerekli Ayarlar (.env)

```env
adminUser=ctxhub
adminPassword=your_password
adminDeployPath=/home/ctxhub/
adminDeployServer=server.name
```

## İşlem Adımları

### Ücretli owner için yeni Free tenant geçişi

API sürümünü yükseltmeden önce eski unique indexi kontrol edin; ilk komut yalnızca dry-run yapar:

```bash
pnpm db:migrate-tenant-provisioning
pnpm db:migrate-tenant-provisioning -- --apply
```

İkinci komut yalnızca `createdBy_1_provisioningChannel_1` biçimindeki eski unique partial
indexi kaldırır. Güncel servis kuralı creator toplamını değil, owner'ın aktif Free tenant sayısını
kontrol eder; yalnızca ücretli tenant'ları olan bir owner yeni bir Free tenant oluşturabilir. Başka
tenant veya içerik verisini değiştirmez ve migration'ın tekrar çalıştırılması güvenlidir.

### `pnpm deploy` komutu şunları yapar:

1. ✅ Commercial pluginleri (`semantic-search` ve `tenant-backup`) içeren hosted Admin panelini production için build eder
2. ✅ Ücretli plan entitlement kayıtlarını doğrular; eksikse deploy'u durdurur
3. ✅ SSH ile sunucuya bağlanır
4. ✅ Mevcut dosyaları yedekler (`.backup-[timestamp]`)
5. ✅ Tüm dosyaları sunucuya yükler
6. ✅ Dosya izinlerini ayarlar (755)
7. ✅ Deploy sonucunu gösterir

### Örnek Çıktı:

```
🚀 Admin Panel Deploy Başlatılıyor...

📦 Kaynak: /Users/you/contextHub/
🌐 Hedef: ctxhub@server.name:/home/ctxhub/

🔐 SSH bağlantısı kuruluyor...
✅ SSH bağlantısı başarılı!

📁 Hedef dizin kontrol ediliyor...
✅ Hedef dizin hazır

💾 Mevcut dosyalar yedekleniyor...
✅ Yedeklendi

📤 Dosyalar yükleniyor...
⏳ Bu işlem birkaç dakika sürebilir...
..........

✅ Tüm dosyalar başarıyla yüklendi!

📊 Yüklenen dosya sayısı: 47
🔒 Dosya izinleri ayarlandı

🎉 Deploy başarıyla tamamlandı!
```

## Sorun Giderme

### "Build klasörü bulunamadı" hatası
```bash
pnpm build:admin:hosted
```

### "Community Admin build" veya "plugin entry was not found" hatası

Canlı deploy bilerek durdurulmuştur. `ctxhub-commercial` checkout'unu public repo ile
yan yana tutun veya root `.env` içinde `CTXHUB_ADMIN_PLUGIN_ENTRY` yolunu açıkça verin.
Community `pnpm build:admin` çıktısı canlı hosted servise deploy edilemez.
Hosted build veya deploy, `semantic-search` ya da `tenant-backup` eksikse de durdurulur.

### "SSH bağlantısı kurulamadı" hatası
- `.env` dosyasındaki `adminDeployServer` değerini kontrol edin
- SSH bağlantısını manuel test edin: `ssh ctxhub@server.name`

### "Kimlik doğrulama başarısız" hatası
- `.env` dosyasındaki `adminUser` ve `adminPassword` değerlerini kontrol edin

### "Permission denied" hatası
- Sunucudaki hedef dizine yazma iznine sahip olduğunuzdan emin olun
- SSH kullanıcısının yeterli yetkisi olmalı

## Detaylı Dokümantasyon

Daha fazla bilgi için: [DEPLOY.md](./DEPLOY.md)

---

**Not:** Deploy işlemi 1-5 dakika sürebilir (internet hızınıza bağlı olarak).
