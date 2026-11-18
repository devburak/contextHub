/**
 * What a public form may accept as a file, and how the content is verified.
 *
 * The list below is the platform ceiling: a form field can narrow it but never
 * widen it. Types are verified from the bytes of the uploaded object, not from
 * the name or content type the client declared.
 */

const MB = 1024 * 1024;
const PLATFORM_MAX_FILE_BYTES = 20 * MB;
const PLATFORM_MAX_FILES_PER_FIELD = 5;
const DEFAULT_MAX_FILES_PER_FIELD = 1;

// How long a submitted file is kept before it is deleted automatically. There
// is deliberately no "keep forever" option.
const DEFAULT_RETENTION_DAYS = 180;
const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 730;

// extension -> canonical MIME type, category, and the content kinds accepted for it
const ALLOWED_TYPES = Object.freeze({
  jpg: { mime: 'image/jpeg', category: 'image', kinds: ['jpeg'] },
  jpeg: { mime: 'image/jpeg', category: 'image', kinds: ['jpeg'] },
  png: { mime: 'image/png', category: 'image', kinds: ['png'] },
  webp: { mime: 'image/webp', category: 'image', kinds: ['webp'] },
  gif: { mime: 'image/gif', category: 'image', kinds: ['gif'] },
  heic: { mime: 'image/heic', category: 'image', kinds: ['heic'] },
  heif: { mime: 'image/heif', category: 'image', kinds: ['heic'] },
  avif: { mime: 'image/avif', category: 'image', kinds: ['avif'] },

  pdf: { mime: 'application/pdf', category: 'document', kinds: ['pdf'] },
  doc: { mime: 'application/msword', category: 'document', kinds: ['ole'] },
  xls: { mime: 'application/vnd.ms-excel', category: 'document', kinds: ['ole'] },
  ppt: { mime: 'application/vnd.ms-powerpoint', category: 'document', kinds: ['ole'] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'document', kinds: ['docx'] },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'document', kinds: ['xlsx'] },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', category: 'document', kinds: ['pptx'] },
  odt: { mime: 'application/vnd.oasis.opendocument.text', category: 'document', kinds: ['odt'] },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', category: 'document', kinds: ['ods'] },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation', category: 'document', kinds: ['odp'] },
  txt: { mime: 'text/plain', category: 'document', kinds: ['text'] },
  csv: { mime: 'text/csv', category: 'document', kinds: ['text'] },
  rtf: { mime: 'application/rtf', category: 'document', kinds: ['rtf'] },

  mp4: { mime: 'video/mp4', category: 'video', kinds: ['mp4'] },
  webm: { mime: 'video/webm', category: 'video', kinds: ['webm'] },
  mov: { mime: 'video/quicktime', category: 'video', kinds: ['mov'] },

  mp3: { mime: 'audio/mpeg', category: 'audio', kinds: ['mp3'] },
  m4a: { mime: 'audio/mp4', category: 'audio', kinds: ['m4a', 'mp4'] },
  wav: { mime: 'audio/wav', category: 'audio', kinds: ['wav'] },
  ogg: { mime: 'audio/ogg', category: 'audio', kinds: ['ogg'] }
});

const ALLOWED_EXTENSIONS = Object.freeze(Object.keys(ALLOWED_TYPES));

class FormUploadPolicyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FormUploadPolicyError';
    this.code = code;
    this.statusCode = 400;
    this.details = details;
  }
}

function getExtension(filename) {
  const name = String(filename || '').trim();
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/**
 * Keep the visitor's file name for display, but strip anything that could be
 * misread as a path or break a Content-Disposition header.
 */
function sanitizeFilename(filename) {
  const base = String(filename || '').split(/[\\/]/).pop() || '';
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(-150) || 'file';
}

/**
 * Narrow the platform list with a field's own `validation.fileTypes`. Entries
 * may be MIME types ("application/pdf"), wildcards ("image/*") or extensions
 * (".pdf" / "pdf"). An empty or missing list means "everything the platform allows".
 */
function resolveAllowedExtensions(fileTypes) {
  const entries = (Array.isArray(fileTypes) ? fileTypes : [])
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);
  if (!entries.length) return [...ALLOWED_EXTENSIONS];

  return ALLOWED_EXTENSIONS.filter((ext) => {
    const type = ALLOWED_TYPES[ext];
    return entries.some((entry) => {
      if (entry === `.${ext}` || entry === ext) return true;
      if (entry === type.mime) return true;
      if (entry.endsWith('/*')) return type.mime.startsWith(entry.slice(0, -1));
      return false;
    });
  });
}

function resolveFieldPolicy(field) {
  const validation = field?.validation || {};
  const fieldMaxBytes = Number(validation.maxFileSize) > 0
    ? Math.floor(Number(validation.maxFileSize) * MB)
    : PLATFORM_MAX_FILE_BYTES;
  const requestedMaxFiles = Number(validation.maxFiles);
  const maxFiles = Number.isInteger(requestedMaxFiles) && requestedMaxFiles > 0
    ? Math.min(requestedMaxFiles, PLATFORM_MAX_FILES_PER_FIELD)
    : DEFAULT_MAX_FILES_PER_FIELD;

  return {
    maxBytes: Math.min(fieldMaxBytes, PLATFORM_MAX_FILE_BYTES),
    maxFiles,
    allowedExtensions: resolveAllowedExtensions(validation.fileTypes)
  };
}

/**
 * Check what the client says it is about to upload. Returns the canonical
 * extension and MIME type; the MIME type is chosen by the server, never taken
 * from the client.
 */
function validateDeclaration({ field, filename, size }) {
  const policy = resolveFieldPolicy(field);
  const extension = getExtension(filename);
  const type = ALLOWED_TYPES[extension];

  if (!type || !policy.allowedExtensions.includes(extension)) {
    throw new FormUploadPolicyError('FileTypeNotAllowed', 'This file type is not allowed for this field', {
      extension,
      allowedExtensions: policy.allowedExtensions
    });
  }

  const bytes = Number(size);
  if (!Number.isInteger(bytes) || bytes <= 0) {
    throw new FormUploadPolicyError('InvalidFileSize', 'size must be a positive integer number of bytes');
  }
  if (bytes > policy.maxBytes) {
    throw new FormUploadPolicyError('FileTooLarge', `File exceeds the ${Math.floor(policy.maxBytes / MB)} MB limit`, {
      maxBytes: policy.maxBytes
    });
  }

  return {
    extension,
    mimeType: type.mime,
    category: type.category,
    filename: sanitizeFilename(filename),
    policy
  };
}

function resolveRetentionDays(form) {
  const days = Number(form?.settings?.fileRetentionDays);
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_RETENTION_DAYS;
  return Math.min(Math.max(Math.round(days), MIN_RETENTION_DAYS), MAX_RETENTION_DAYS);
}

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function ascii(buffer, start, end) {
  return buffer.toString('latin1', start, Math.min(end, buffer.length));
}

function listZipEntries(buffer) {
  // The end-of-central-directory record sits at the end, after an optional comment.
  const minEocd = 22;
  if (buffer.length < minEocd) return null;
  const searchFrom = Math.max(0, buffer.length - minEocd - 0xffff);
  let eocd = -1;
  for (let i = buffer.length - minEocd; i >= searchFrom; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const names = [];
  for (let i = 0; i < total && i < 5000; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

function readOdfMimetype(buffer) {
  // ODF requires the first entry to be an uncompressed file named "mimetype".
  if (buffer.length < 30 || buffer.readUInt32LE(0) !== 0x04034b50) return null;
  const method = buffer.readUInt16LE(8);
  const size = buffer.readUInt32LE(18);
  const nameLength = buffer.readUInt16LE(26);
  const extraLength = buffer.readUInt16LE(28);
  if (method !== 0 || size > 200) return null;
  if (ascii(buffer, 30, 30 + nameLength) !== 'mimetype') return null;
  const start = 30 + nameLength + extraLength;
  return ascii(buffer, start, start + size);
}

function classifyZip(buffer) {
  const names = listZipEntries(buffer);
  if (!names) return 'zip';

  if (names.includes('[Content_Types].xml')) {
    // Macro-enabled Office files carry a VBA project regardless of their extension.
    if (names.some((name) => name.toLowerCase().endsWith('vbaproject.bin'))) return 'ooxml-macro';
    if (names.includes('word/document.xml')) return 'docx';
    if (names.includes('xl/workbook.xml')) return 'xlsx';
    if (names.includes('ppt/presentation.xml')) return 'pptx';
    return 'zip';
  }

  const odf = readOdfMimetype(buffer);
  if (odf === 'application/vnd.oasis.opendocument.text') return 'odt';
  if (odf === 'application/vnd.oasis.opendocument.spreadsheet') return 'ods';
  if (odf === 'application/vnd.oasis.opendocument.presentation') return 'odp';
  return 'zip';
}

function classifyIsoMedia(buffer) {
  const boxSize = buffer.readUInt32BE(0);
  const major = ascii(buffer, 8, 12);
  const brandsEnd = Math.min(boxSize > 16 ? boxSize : 16, buffer.length, 256);
  const brands = [major];
  for (let i = 16; i + 4 <= brandsEnd; i += 4) brands.push(ascii(buffer, i, i + 4));

  if (brands.some((brand) => brand === 'avif' || brand === 'avis')) return 'avif';
  if (brands.some((brand) => ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand))) return 'heic';
  if (major === 'mif1' || major === 'msf1') return 'heic';
  if (major === 'qt  ') return 'mov';
  if (major === 'M4A ' || major === 'M4B ') return 'm4a';
  return 'mp4';
}

function looksLikeText(buffer) {
  // UTF-16 text is full of NUL bytes, so it is only accepted with a byte-order mark.
  if (startsWith(buffer, [0xff, 0xfe]) || startsWith(buffer, [0xfe, 0xff])) return true;
  for (let i = 0; i < buffer.length; i += 1) {
    const byte = buffer[i];
    if (byte === 0x7f || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x0c)) {
      return false;
    }
  }
  return true;
}

/**
 * Identify a file from its bytes. Returns a content kind such as "jpeg", "pdf",
 * "docx", "zip" or "text"; "unknown" when nothing matches.
 */
function detectContentKind(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return 'unknown';

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (ascii(buffer, 0, 6) === 'GIF87a' || ascii(buffer, 0, 6) === 'GIF89a') return 'gif';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return 'webp';
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WAVE') return 'wav';
  if (ascii(buffer, 0, 5) === '%PDF-') return 'pdf';
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'ole';
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) return classifyZip(buffer);
  if (startsWith(buffer, [0x50, 0x4b, 0x05, 0x06]) || startsWith(buffer, [0x50, 0x4b, 0x07, 0x08])) return 'zip';
  if (ascii(buffer, 0, 5) === '{\\rtf') return 'rtf';
  if (ascii(buffer, 0, 4) === 'OggS') return 'ogg';
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return ascii(buffer, 0, 64).includes('webm') ? 'webm' : 'matroska';
  }
  if (buffer.length >= 12 && ascii(buffer, 4, 8) === 'ftyp') return classifyIsoMedia(buffer);
  if (ascii(buffer, 0, 3) === 'ID3') return 'mp3';
  // MPEG audio frame sync with the Layer III bits; excludes AAC/ADTS streams.
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0 && ((buffer[1] >> 1) & 0x03) === 0x01) {
    return 'mp3';
  }
  if (startsWith(buffer, [0x4d, 0x5a]) || startsWith(buffer, [0x7f, 0x45, 0x4c, 0x46])) return 'executable';
  if (startsWith(buffer, [0x52, 0x61, 0x72, 0x21])) return 'rar';

  return looksLikeText(buffer) ? 'text' : 'unknown';
}

/**
 * Does the content of an uploaded object match the extension it was declared with?
 */
function verifyContent({ buffer, extension }) {
  const type = ALLOWED_TYPES[extension];
  const kind = detectContentKind(buffer);
  if (!type) return { ok: false, kind };
  return { ok: type.kinds.includes(kind), kind };
}

module.exports = {
  ALLOWED_TYPES,
  ALLOWED_EXTENSIONS,
  PLATFORM_MAX_FILE_BYTES,
  PLATFORM_MAX_FILES_PER_FIELD,
  DEFAULT_MAX_FILES_PER_FIELD,
  DEFAULT_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  MAX_RETENTION_DAYS,
  FormUploadPolicyError,
  getExtension,
  sanitizeFilename,
  resolveAllowedExtensions,
  resolveFieldPolicy,
  resolveRetentionDays,
  validateDeclaration,
  detectContentKind,
  verifyContent
};
