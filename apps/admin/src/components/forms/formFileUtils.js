// Helpers for files submitted through forms. A file field's value in a
// response is a list of { uploadId, filename, size, mimeType } records.

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function isFileRecord(item) {
  return Boolean(item) && typeof item === 'object' && !Array.isArray(item)
    && (typeof item.uploadId === 'string' || typeof item.filename === 'string');
}

/** The file records in a field value, or an empty list when it holds none. */
export function getFileRecords(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.filter(isFileRecord);
}

/**
 * One-line text for a response value, used in lists and fallbacks. Files are
 * shown by name; other objects are never shown as "[object Object]".
 */
export function formatPreviewValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.map((item) => formatPreviewValue(item)).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    if (isFileRecord(value)) return value.filename || 'Dosya';
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }
  return String(value);
}

// Mirrors the API rule: until files are scanned, only images, video, audio
// and PDF may be moved to the public media library.
export function isPromotableWithoutScan(mimeType = '') {
  const type = String(mimeType).toLowerCase();
  return type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/') || type === 'application/pdf';
}

export function canPromoteFile(state = {}, mimeType) {
  if (state.status !== 'attached') return false;
  if (state.scanStatus === 'infected') return false;
  return state.scanStatus === 'clean' || isPromotableWithoutScan(mimeType);
}

const SCAN_LABELS = {
  not_scanned: { label: 'Taranmadı', className: 'bg-gray-100 text-gray-600' },
  pending: { label: 'Taranıyor', className: 'bg-blue-50 text-blue-700' },
  clean: { label: 'Temiz', className: 'bg-green-50 text-green-700' },
  infected: { label: 'Zararlı içerik', className: 'bg-red-50 text-red-700' },
  error: { label: 'Taranamadı', className: 'bg-amber-50 text-amber-700' },
};

export function describeScanStatus(scanStatus) {
  return SCAN_LABELS[scanStatus] || SCAN_LABELS.not_scanned;
}

/** Availability of a file, from its state on the response. */
export function describeFileState(state = {}) {
  switch (state.status) {
    case 'attached':
      return { available: true, label: 'Mevcut', className: 'bg-green-50 text-green-700' };
    case 'promoted':
      return { available: false, label: 'Medya kütüphanesine taşındı', className: 'bg-indigo-50 text-indigo-700' };
    case 'expired':
      return state.deleteReason === 'retention'
        ? { available: false, label: 'Saklama süresi doldu, silindi', className: 'bg-gray-100 text-gray-600' }
        : { available: false, label: 'Süresi doldu', className: 'bg-gray-100 text-gray-600' };
    default:
      return { available: false, label: 'Silindi', className: 'bg-gray-100 text-gray-600' };
  }
}

const ERROR_MESSAGES = {
  PromotionRequiresScan: 'Bu dosya türü, tarama servisi devreye girmeden medya kütüphanesine taşınamaz.',
  PdfActiveContent: 'Bu PDF aktif içerik (ör. JavaScript, gömülü dosya) barındırıyor; taranmadan yayınlanamaz.',
  FileInfected: 'Bu dosya tarayıcı tarafından zararlı olarak işaretlendi.',
  FileContentMismatch: 'Dosyanın içeriği türüyle uyuşmuyor.',
  StorageLimitExceeded: 'Depolama kotası dolu. Medya kütüphanesinde yer açıp tekrar deneyin.',
  UploadNotFound: 'Dosya bulunamadı; silinmiş ya da taşınmış olabilir.',
  UploadNotAvailable: 'Dosya artık kullanılabilir değil.',
  FormUploadsUnavailable: 'Dosya depolama bu sunucuda yapılandırılmamış.',
};

export function describeFileError(error, fallback) {
  const code = error?.response?.data?.error;
  return ERROR_MESSAGES[code] || error?.response?.data?.message || fallback;
}

// Retention limits, kept in line with the API (formUploadPolicy).
export const RETENTION_DEFAULT_DAYS = 180;
export const RETENTION_MIN_DAYS = 30;
export const RETENTION_MAX_DAYS = 730;

export function clampRetentionDays(value) {
  const days = Math.round(Number(value));
  if (!Number.isFinite(days) || days <= 0) return RETENTION_DEFAULT_DAYS;
  return Math.min(Math.max(days, RETENTION_MIN_DAYS), RETENTION_MAX_DAYS);
}

// Upload limits for one file field, kept in line with the API.
export const MAX_FILE_SIZE_MB = 20;
export const MAX_FILES_PER_FIELD = 5;

// The file types the platform accepts, grouped for the field settings. A
// field stores the chosen extensions in validation.fileTypes; an empty list
// means every type below is accepted.
export const FILE_TYPE_GROUPS = [
  { key: 'image', label: 'Görseller', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'avif'] },
  { key: 'pdf', label: 'PDF', extensions: ['pdf'] },
  { key: 'office', label: 'Office belgeleri', extensions: ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'] },
  { key: 'opendocument', label: 'OpenDocument', extensions: ['odt', 'ods', 'odp'] },
  { key: 'text', label: 'Metin (TXT, CSV, RTF)', extensions: ['txt', 'csv', 'rtf'] },
  { key: 'video', label: 'Video (MP4, WebM, MOV)', extensions: ['mp4', 'webm', 'mov'] },
  { key: 'audio', label: 'Ses (MP3, M4A, WAV, OGG)', extensions: ['mp3', 'm4a', 'wav', 'ogg'] },
];

const KNOWN_EXTENSIONS = new Set(FILE_TYPE_GROUPS.flatMap((group) => group.extensions));

/** Extensions selected on a field, normalised (".PDF" -> "pdf"); unknown entries are dropped. */
export function getSelectedExtensions(fileTypes) {
  return (Array.isArray(fileTypes) ? fileTypes : [])
    .map((entry) => String(entry || '').trim().toLowerCase().replace(/^\./, ''))
    .filter((ext) => KNOWN_EXTENSIONS.has(ext));
}

export function isGroupSelected(fileTypes, group) {
  const selected = new Set(getSelectedExtensions(fileTypes));
  return group.extensions.every((ext) => selected.has(ext));
}

/** Turn one group on or off and return the new validation.fileTypes list. */
export function toggleFileTypeGroup(fileTypes, group, enabled) {
  const selected = new Set(getSelectedExtensions(fileTypes));
  group.extensions.forEach((ext) => (enabled ? selected.add(ext) : selected.delete(ext)));
  return FILE_TYPE_GROUPS.flatMap((item) => item.extensions)
    .filter((ext) => selected.has(ext))
    .map((ext) => `.${ext}`);
}

/** Clamp a number field to [min, max]; empty input clears the setting. */
export function clampOptionalInt(value, min, max) {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return undefined;
  return Math.min(Math.max(number, min), max);
}

/** What is still missing before file fields can accept submissions. */
export function describeMissingUploadSetup(status) {
  if (!status || status.ready) return [];
  const missing = [];
  if (!status.configured) {
    missing.push({ key: 'storage', text: 'Bu sunucuda form dosyaları için depolama yapılandırılmamış. Sistem yöneticinize başvurun.' });
  }
  if (!status.planAllowed) {
    missing.push({ key: 'plan', text: 'Form üzerinden dosya alma mevcut paketinizde yok.', link: 'Paketleri görüntüle' });
  }
  if (!status.turnstileConfigured) {
    missing.push({ key: 'turnstile', text: 'Dosya kabul etmek için Varlık Ayarları\'ndan Turnstile anahtarlarını girin.', link: 'Ayarlara git' });
  }
  return missing;
}
