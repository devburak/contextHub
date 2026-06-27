#!/usr/bin/env node
/**
 * send-mail.cjs — ContextHub'ın tanımlı mail sistemi (mailService / global SMTP) üzerinden
 * basit bir bildirim e-postası gönderir. Cron script'lerinden çağrılmak içindir.
 *
 * Birden fazla alıcı: virgül / noktalı virgül / boşlukla ayrılabilir.
 *   "a@x.com, b@y.com"  veya  BACKUP_ALERT_EMAIL="a@x.com b@y.com"
 *
 * Kullanım:
 *   echo "gövde metni" | node scripts/send-mail.cjs "a@x.com,b@y.com" "Konu"
 *   BACKUP_ALERT_EMAIL=...  -> argv yoksa bu ortam değişkeni kullanılır
 *
 * .env'den SMTP_* değerlerini okur (ENV_FILE ile yol değiştirilebilir).
 * Çıkış kodu: 0 gönderildi, 1 gönderilemedi, 2 alıcı yok.
 */
const path = require('path');
require('dotenv').config({ path: process.env.ENV_FILE || path.resolve(__dirname, '../.env') });

const rawTo = process.argv[2] || process.env.BACKUP_ALERT_EMAIL || '';
const recipients = rawTo.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
const subject = process.argv[3] || 'ContextHub bildirimi';

let body = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => { body += d; });
process.stdin.on('end', async () => {
  if (!recipients.length) { console.error('[send-mail] Alıcı yok (argv veya BACKUP_ALERT_EMAIL).'); process.exit(2); }
  try {
    const { mailService } = require('../apps/api/src/services/mailService');
    await mailService.sendMail({ to: recipients, subject, text: body || subject });
    console.log('[send-mail] Gönderildi ->', recipients.join(', '));
    process.exit(0);
  } catch (err) {
    console.error('[send-mail] Gönderilemedi:', err.message);
    process.exit(1);
  }
});
