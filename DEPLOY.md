# 🚀 Admin Panel Deploy Rehberi

Bu rehber, ContextHub Admin Panel'in production sunucusuna nasıl deploy edileceğini açıklar.

## 📋 Gereksinimler

- Node.js 18+ ve pnpm yüklü olmalı
- `.env` dosyasında deploy ayarları yapılandırılmış olmalı
- Sunucuya SSH erişimi olmalı

## ⚙️ Deploy Ayarları

`.env` dosyasında aşağıdaki değişkenlerin tanımlı olması gerekir:

```env
# Deploy ayarları
adminUser=ctxhub
adminPassword=your_ssh_password
adminDeployPath=/home/ctxhub/
adminDeployServer=....
```

### Değişken Açıklamaları:

- **adminUser**: SSH kullanıcı adı
- **adminPassword**: SSH şifresi
- **adminDeployPath**: Sunucudaki hedef dizin (mutlak yol)
- **adminDeployServer**: Sunucu adresi (hostname veya IP)

## 🔧 Kurulum

İlk kez deploy yapacaksanız, gerekli bağımlılıkları yükleyin:

```bash
pnpm install
```

## 🚀 Deploy Komutları

### 1. Otomatik Deploy (Build + Upload)

Build alıp otomatik olarak sunucuya yükler:

```bash
pnpm deploy
```

Bu komut şunları yapar:
1. ✅ Admin panel'i production için build eder (`pnpm build:admin`)
2. ✅ SSH ile sunucuya bağlanır
3. ✅ Mevcut dosyaları yedekler (opsiyonel)
4. ✅ Yeni dosyaları sunucuya yükler
5. ✅ Dosya izinlerini ayarlar

### 2. Sadece Upload (Build olmadan)

Eğer build zaten alınmışsa, sadece upload yapmak için:

```bash
pnpm deploy:admin
```

### 3. Manuel Build

Sadece build almak için (deploy yapmadan):

```bash
pnpm build:admin
```

## 📂 Deploy Süreci Detayları

### 1. Build Aşaması

```bash
pnpm build:admin
```

- Admin panel Vite ile production build alınır
- Çıktı: `apps/admin/dist/` klasörü
- Assets optimize edilir, minify yapılır
- Source map'ler oluşturulur

### 2. Upload Aşaması

```bash
node scripts/deploy-admin.mjs
```

**İşlem Adımları:**

1. **Bağlantı Kontrolü**
   - SSH bağlantısı kurulur
   - Kimlik doğrulaması yapılır

2. **Yedekleme**
   - Mevcut dosyalar `.backup-[timestamp]` dizinine kopyalanır
   - 30 günden eski yedekler otomatik silinir

3. **Dosya Yükleme**
   - `dist/` klasörü sunucuya kopyalanır
   - `.DS_Store` gibi gereksiz dosyalar atlanır
   - İlerleme göstergesi görüntülenir

4. **İzin Ayarlama**
   - Tüm dosyalara `755` izni verilir

5. **Doğrulama**
   - Yüklenen dosya sayısı gösterilir
   - Deploy sonucu raporlanır

## 🔐 Güvenlik Notları

### SSH Kimlik Doğrulama

**Önerilen Yöntem: SSH Key**

Şifre yerine SSH key kullanmak daha güvenlidir. SSH key kullanmak için script'i şu şekilde güncelleyin:

```javascript
// deploy-admin.mjs içinde
await ssh.connect({
  host: config.host,
  username: config.username,
  privateKey: readFileSync('/path/to/your/private/key'),
  port: 22
});
```

### .env Güvenliği

- ⚠️ `.env` dosyası **asla** git'e eklenmemelidir
- ✅ `.gitignore` içinde olduğundan emin olun
- ✅ Şifreleri güvenli bir yerde saklayın (örn: password manager)

## 🐛 Sorun Giderme

### Hata: "Build klasörü bulunamadı"

**Çözüm:**
```bash
pnpm build:admin
```

### Hata: "SSH bağlantısı kurulamadı"

**Olası Nedenler:**
- Sunucu adresi yanlış (`adminDeployServer`)
- SSH portu kapalı (varsayılan: 22)
- Firewall kuralları

**Çözüm:**
```bash
# SSH bağlantısını test edin
ssh adminUser@adminDeployServer
```

### Hata: "Kimlik doğrulama başarısız"

**Olası Nedenler:**
- Kullanıcı adı yanlış (`adminUser`)
- Şifre yanlış (`adminPassword`)

**Çözüm:**
- `.env` dosyasındaki bilgileri kontrol edin
- SSH ile manuel bağlanmayı deneyin

### Hata: "Permission denied"

**Olası Nedenler:**
- Hedef dizine yazma izni yok
- Kullanıcı yeterli yetkiye sahip değil

**Çözüm:**
```bash
# Sunucuda dizin izinlerini kontrol edin
ls -la /home/ctxhub/

# Gerekirse izinleri düzeltin
chmod 755 /home/ctxhub/
```

## 📊 Deploy Logları

Deploy işlemi sırasında göreceğiniz çıktılar:

```
🚀 Admin Panel Deploy Başlatılıyor...

📦 Kaynak: /path/to/apps/admin/dist
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

🔒 Dosya izinlerini ayarlanıyor...
✅ İzinler ayarlandı

🎉 Deploy başarıyla tamamlandı!
🌍 Site: https://www.ikon-x.com.tr/

🧹 Eski yedekler temizleniyor...
✅ Temizleme tamamlandı
```

## 🔄 Rollback (Geri Alma)

Deploy sonrası sorun yaşarsanız, yedekten geri dönebilirsiniz:

```bash
# Sunucuya bağlanın
ssh ctxhub@server.name

# En son yedeği bulun
ls -lt /home/ctxhub/| grep backup

# Yedeği geri yükleyin
rm -rf /home/ctxhub/*
cp -r /home/ctxhub/backup-[timestamp]/* /home/ctxhub/
```

## 📝 Deploy Checklist

Deploy öncesi kontrol listesi:

- [ ] `.env` dosyası doğru yapılandırılmış
- [ ] `pnpm install` çalıştırıldı
- [ ] Local'de test edildi (`pnpm dev:admin`)
- [ ] Build başarılı (`pnpm build:admin`)
- [ ] SSH bağlantısı test edildi
- [ ] Hedef dizin yazılabilir
- [ ] Production API endpoint'leri doğru
- [ ] Environment variables production'a göre ayarlandı

## 🎯 Best Practices

1. **Staging Environment**
   - Production'a göndermeden önce staging'de test edin
   - Ayrı bir `adminDeployPathStaging` kullanın

2. **Automated Backup**
   - Deploy script otomatik yedekleme yapar
   - 30 günden eski yedekler silinir

3. **Version Control**
   - Her deploy öncesi git commit yapın
   - Tag kullanarak versiyonları işaretleyin

4. **Monitoring**
   - Deploy sonrası siteyi kontrol edin
   - Browser console'da hata olup olmadığına bakın
   - Network tab'da API çağrılarını kontrol edin

## 🔗 İlgili Komutlar

```bash
# Development server başlat
pnpm dev:admin

# Build al (minified)
pnpm build:admin

# Build önizleme (local)
cd apps/admin && pnpm preview

# Tüm workspace'i build et
pnpm build

# Temizlik yap
pnpm clean
```

## 💡 İpuçları

- **Hızlı Deploy**: Build cached ise, sadece `pnpm deploy:admin` kullanın
- **Büyük Dosyalar**: Upload süresi dosya boyutuna bağlıdır (~1-5 dakika)
- **Network**: Yavaş internet bağlantısı deploy süresini artırır
- **SSH Key**: Şifre yerine SSH key kullanmak hem güvenli hem hızlıdır

## 📞 Destek

Sorun yaşarsanız:

1. Deploy loglarını kontrol edin
2. "Sorun Giderme" bölümüne bakın
3. SSH ile manuel bağlanmayı deneyin
4. Sunucu yöneticisiyle iletişime geçin

---

**Son Güncelleme:** 7 Ekim 2025
