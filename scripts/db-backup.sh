#!/usr/bin/env bash
#
# db-backup.sh — ContextHub MongoDB yedekleme (cron için)
#
# .env'den MONGODB_URI / MONGODB_DB_NAME okur, mongodump ile tek bir gzip'li
# archive dosyasına yedek alır ve saklama süresini aşan eski yedekleri siler.
#
# Yapılandırma (.env veya ortam değişkeni ile geçersiz kılınabilir):
#   MONGODB_URI             (zorunlu) mongodb+srv://... bağlantı dizesi
#   MONGODB_DB_NAME         (ops.)    yedeklenecek veritabanı; boşsa tüm cluster
#   BACKUP_DIR              (ops.)    yedek klasörü (vars: <repo>/backups)
#   BACKUP_RETENTION_DAYS   (ops.)    kaç günden eski yedekler silinsin (vars: 7)
#   BACKUP_ALERT_EMAIL      (ops.)    hata olursa uyarı e-postası gönderilecek adres(ler);
#                                     ContextHub mail sistemi (SMTP_*) üzerinden. Birden fazla
#                                     için virgülle ayırın: "a@x.com,b@y.com"
#   BACKUP_NOTIFY_SUCCESS   (ops.)    "true" ise başarılı yedekte de (dosya adı+boyut)
#                                     e-posta atılır (vars: true). Kapatmak için "false".
#   ENV_FILE               (ops.)    .env yolu (vars: <repo>/.env)
#
# Kullanım:
#   ./scripts/db-backup.sh
#   BACKUP_DIR=/var/backups/contexthub BACKUP_RETENTION_DAYS=14 ./scripts/db-backup.sh
#
set -euo pipefail

# --- Yollar ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_DIR}/.env}"

MAIL_HELPER="${SCRIPT_DIR}/send-mail.cjs"

log() { printf '%s [db-backup] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# ContextHub mail sistemi (global SMTP) üzerinden bildirim gönder.
send_alert() {
  local subject="$1" body="$2"
  [ -n "${BACKUP_ALERT_EMAIL:-}" ] || return 0
  command -v node >/dev/null 2>&1 || { log "node yok; bildirim atlandı."; return 0; }
  [ -f "$MAIL_HELPER" ] || { log "mail helper yok ($MAIL_HELPER); bildirim atlandı."; return 0; }
  printf '%s' "$body" \
    | ENV_FILE="$ENV_FILE" node "$MAIL_HELPER" "$BACKUP_ALERT_EMAIL" "$subject" \
    && log "Bildirim e-postası gönderildi: ${BACKUP_ALERT_EMAIL}" \
    || log "Bildirim e-postası gönderilemedi."
}

# Hata bildirimi
notify_failure() {
  send_alert "[ContextHub] DB yedekleme BAŞARISIZ" \
"$1

Sunucu: $(hostname 2>/dev/null || echo '?')
Zaman : $(date '+%Y-%m-%d %H:%M:%S')
Yedek klasörü: ${BACKUP_DIR:-?}"
}

# Başarı bildirimi (dosya adı + boyut). BACKUP_NOTIFY_SUCCESS=false ile kapatılabilir.
notify_success() {
  [ "${BACKUP_NOTIFY_SUCCESS:-true}" = "true" ] || return 0
  send_alert "[ContextHub] DB yedekleme tamam" \
"DB yedeği başarıyla alındı.

Dosya : $1
Boyut : $2
Sunucu: $(hostname 2>/dev/null || echo '?')
Zaman : $(date '+%Y-%m-%d %H:%M:%S')"
}

die() { log "HATA: $*" >&2; notify_failure "DB yedekleme başarısız: $*"; exit 1; }

# --- .env'den anahtar oku (source etmeden; tırnakları soyar) ---
# Not: set -euo pipefail altında, anahtar yoksa grep 1 döndürür; pipefail bunu
# yayar ve atama hata verir. Bu yüzden grep çıktısı önce local değişkene alınıp
# (|| true) boşsa erken çıkılır.
get_env() {
  [ -f "$ENV_FILE" ] || return 0
  local line
  line="$(grep -E "^[[:space:]]*$1=" "$ENV_FILE" | head -1)" || true
  [ -n "$line" ] || return 0
  printf '%s' "$line" \
    | sed -E "s/^[[:space:]]*$1=//" \
    | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}

# Ortamda tanımlı değilse .env'den al
MONGODB_URI="${MONGODB_URI:-$(get_env MONGODB_URI)}"
MONGODB_DB_NAME="${MONGODB_DB_NAME:-$(get_env MONGODB_DB_NAME)}"
BACKUP_DIR="${BACKUP_DIR:-$(get_env BACKUP_DIR)}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$(get_env BACKUP_RETENTION_DAYS)}"
BACKUP_ALERT_EMAIL="${BACKUP_ALERT_EMAIL:-$(get_env BACKUP_ALERT_EMAIL)}"
BACKUP_NOTIFY_SUCCESS="${BACKUP_NOTIFY_SUCCESS:-$(get_env BACKUP_NOTIFY_SUCCESS)}"

BACKUP_DIR="${BACKUP_DIR:-${REPO_DIR}/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

# --- Ön kontroller ---
command -v mongodump >/dev/null 2>&1 || die "mongodump bulunamadı. MongoDB Database Tools kurun."
[ -n "${MONGODB_URI:-}" ] || die "MONGODB_URI tanımlı değil (${ENV_FILE} veya ortam değişkeni)."

mkdir -p "$BACKUP_DIR"

TS="$(date '+%Y%m%d-%H%M%S')"
DB_LABEL="${MONGODB_DB_NAME:-all}"
OUT_FILE="${BACKUP_DIR}/contexthub-${DB_LABEL}-${TS}.archive.gz"

# --- Yedekle ---
log "Yedek başlıyor -> ${OUT_FILE}"
DUMP_ARGS=( --uri="$MONGODB_URI" --archive="$OUT_FILE" --gzip )
[ -n "${MONGODB_DB_NAME:-}" ] && DUMP_ARGS+=( --db="$MONGODB_DB_NAME" )

if ! mongodump "${DUMP_ARGS[@]}"; then
  rm -f "$OUT_FILE"
  die "mongodump başarısız."
fi

# Dosya oluştu ve boş değil mi?
if [ ! -s "$OUT_FILE" ]; then
  rm -f "$OUT_FILE"
  die "Yedek dosyası oluşmadı ya da boş."
fi

SIZE="$(du -h "$OUT_FILE" | cut -f1)"
log "Yedek tamam: ${OUT_FILE} (${SIZE})"
notify_success "$OUT_FILE" "$SIZE"

# --- Saklama süresini aşan eski yedekleri sil ---
if [ "${BACKUP_RETENTION_DAYS}" -gt 0 ] 2>/dev/null; then
  DELETED="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'contexthub-*.archive.gz' -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete | wc -l | tr -d ' ')"
  log "${BACKUP_RETENTION_DAYS} günden eski ${DELETED} yedek silindi."
fi

log "Bitti."
