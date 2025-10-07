#!/usr/bin/env node

import { NodeSSH } from 'node-ssh';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// .env dosyasını yükle
const envPath = join(rootDir, '.env');
if (!existsSync(envPath)) {
  console.error('❌ .env dosyası bulunamadı!');
  process.exit(1);
}

dotenv.config({ path: envPath });

// Deploy ayarlarını kontrol et
const config = {
  host: process.env.adminDeployServer,
  username: process.env.adminUser,
  password: process.env.adminPassword,
  remotePath: process.env.adminDeployPath,
  localPath: join(rootDir, 'apps/admin/dist')
};

// Gerekli değişkenleri kontrol et
const missingVars = [];
if (!config.host) missingVars.push('adminDeployServer');
if (!config.username) missingVars.push('adminUser');
if (!config.password) missingVars.push('adminPassword');
if (!config.remotePath) missingVars.push('adminDeployPath');

if (missingVars.length > 0) {
  console.error('❌ .env dosyasında eksik değişkenler:', missingVars.join(', '));
  process.exit(1);
}

// Build klasörünün varlığını kontrol et
if (!existsSync(config.localPath)) {
  console.error('❌ Build klasörü bulunamadı:', config.localPath);
  console.error('💡 Önce "pnpm build:admin" komutunu çalıştırın.');
  process.exit(1);
}

console.log('🚀 Admin Panel Deploy Başlatılıyor...\n');
console.log('📦 Kaynak:', config.localPath);
console.log('🌐 Hedef:', `${config.username}@${config.host}:${config.remotePath}\n`);

const ssh = new NodeSSH();

async function deploy() {
  try {
    // SSH bağlantısı kur
    console.log('🔐 SSH bağlantısı kuruluyor...');
    await ssh.connect({
      host: config.host,
      username: config.username,
      password: config.password,
      port: 22,
      tryKeyboard: true
    });
    console.log('✅ SSH bağlantısı başarılı!\n');

    // Hedef dizini oluştur (yoksa)
    console.log('📁 Hedef dizin kontrol ediliyor...');
    await ssh.execCommand(`mkdir -p ${config.remotePath}`);
    console.log('✅ Hedef dizin hazır\n');

    // Mevcut dosyaları yedekle (opsiyonel)
    const backupDir = `${config.remotePath}.backup-${Date.now()}`;
    console.log('💾 Mevcut dosyalar yedekleniyor...');
    const backupResult = await ssh.execCommand(
      `if [ -d "${config.remotePath}" ] && [ "$(ls -A ${config.remotePath})" ]; then cp -r ${config.remotePath} ${backupDir}; echo "Yedeklendi"; else echo "Yedeklenecek dosya yok"; fi`
    );
    console.log('✅', backupResult.stdout || 'Yedekleme tamamlandı\n');

    // Dist klasörünü sunucuya yükle
    console.log('📤 Dosyalar yükleniyor...');
    console.log('⏳ Bu işlem birkaç dakika sürebilir...\n');
    
    const uploadResult = await ssh.putDirectory(config.localPath, config.remotePath, {
      recursive: true,
      concurrency: 10,
      validate: (itemPath) => {
        const baseName = itemPath.split('/').pop();
        // .DS_Store gibi gereksiz dosyaları atla
        return baseName !== '.DS_Store' && !baseName.startsWith('.');
      },
      tick: (localPath, remotePath, error) => {
        if (error) {
          console.error('❌', localPath, error);
        } else {
          // Her 10 dosyada bir nokta göster (çok fazla log'u önlemek için)
          if (Math.random() < 0.1) {
            process.stdout.write('.');
          }
        }
      }
    });

    console.log('\n');
    
    if (uploadResult) {
      console.log('✅ Tüm dosyalar başarıyla yüklendi!\n');
      
      // Dosya sayısını kontrol et
      const countResult = await ssh.execCommand(`find ${config.remotePath} -type f | wc -l`);
      console.log('📊 Yüklenen dosya sayısı:', countResult.stdout.trim());
      
      // Dosya izinlerini ayarla
      console.log('\n🔒 Dosya izinleri ayarlanıyor...');
      await ssh.execCommand(`chmod -R 755 ${config.remotePath}`);
      console.log('✅ İzinler ayarlandı\n');
      
      console.log('🎉 Deploy başarıyla tamamlandı!');
      console.log(`🌍 Site: https://${config.host.replace('cp1.', 'www.')}/`);
      
      // Eski yedekleri temizle (30 günden eski)
      console.log('\n🧹 Eski yedekler temizleniyor...');
      await ssh.execCommand(`find $(dirname ${config.remotePath}) -name "$(basename ${config.remotePath}).backup-*" -mtime +30 -exec rm -rf {} \\;`);
      console.log('✅ Temizleme tamamlandı');
      
    } else {
      console.error('❌ Dosya yükleme başarısız!');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Deploy sırasında hata oluştu:', error.message);
    if (error.code === 'ENOTFOUND') {
      console.error('💡 Sunucu adresini kontrol edin:', config.host);
    } else if (error.level === 'client-authentication') {
      console.error('💡 Kullanıcı adı veya şifre hatalı olabilir');
    }
    process.exit(1);
  } finally {
    ssh.dispose();
  }
}

// Deploy'u başlat
deploy();
