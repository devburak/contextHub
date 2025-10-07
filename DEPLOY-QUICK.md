# 🚀 Deploy Quick Start

## Hızlı Kullanım

```bash
# 1. Build al ve deploy et (tek komut)
pnpm deploy

# 2. Sadece build al
pnpm build:admin

# 3. Sadece deploy et (build zaten alınmışsa)
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

### `pnpm deploy` komutu şunları yapar:

1. ✅ Admin panel'i production için build eder
2. ✅ SSH ile sunucuya bağlanır
3. ✅ Mevcut dosyaları yedekler (`.backup-[timestamp]`)
4. ✅ Tüm dosyaları sunucuya yükler
5. ✅ Dosya izinlerini ayarlar (755)
6. ✅ Deploy sonucunu gösterir

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
pnpm build:admin
```

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
