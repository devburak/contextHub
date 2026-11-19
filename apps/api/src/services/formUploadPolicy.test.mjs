import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const policy = require('./formUploadPolicy');

const MB = 1024 * 1024;
const fileField = (validation = {}) => ({ id: 'f1', name: 'cv', type: 'file', validation });

/** Build a minimal ZIP archive with stored (uncompressed) entries. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, content = ''] of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

function ftyp(major, compatible = []) {
  const brands = Buffer.from([major, ...compatible].map((brand) => brand.padEnd(4, ' ')).join(''), 'latin1');
  const box = Buffer.alloc(16 + brands.length - 4);
  box.writeUInt32BE(box.length, 0);
  box.write('ftyp', 4, 'latin1');
  box.write(major.padEnd(4, ' '), 8, 'latin1');
  brands.copy(box, 16, 4);
  return Buffer.concat([box, Buffer.alloc(32)]);
}

describe('form upload declaration', () => {
  it('accepts allowed types and picks the MIME type itself', () => {
    const result = policy.validateDeclaration({ field: fileField(), filename: 'Özgeçmiş.PDF', size: 1024 });
    expect(result).toMatchObject({ extension: 'pdf', mimeType: 'application/pdf', filename: 'Özgeçmiş.PDF' });
  });

  it.each(['page.html', 'logo.svg', 'archive.zip', 'archive.rar', 'setup.exe', 'macro.docm', 'script.js', 'noextension'])(
    'rejects %s',
    (filename) => {
      expect(() => policy.validateDeclaration({ field: fileField(), filename, size: 10 }))
        .toThrowError(expect.objectContaining({ code: 'FileTypeNotAllowed' }));
    }
  );

  it('uses the last extension, so a disguised double extension is rejected', () => {
    expect(() => policy.validateDeclaration({ field: fileField(), filename: 'cv.pdf.exe', size: 10 }))
      .toThrowError(expect.objectContaining({ code: 'FileTypeNotAllowed' }));
  });

  it('caps size at 20 MB even when the field asks for more', () => {
    const field = fileField({ maxFileSize: 500 });
    expect(policy.resolveFieldPolicy(field).maxBytes).toBe(20 * MB);
    expect(() => policy.validateDeclaration({ field, filename: 'a.pdf', size: 20 * MB + 1 }))
      .toThrowError(expect.objectContaining({ code: 'FileTooLarge' }));
    expect(policy.validateDeclaration({ field, filename: 'a.pdf', size: 20 * MB }).extension).toBe('pdf');
  });

  it('lets a field narrow the size and the file types but never widen them', () => {
    const field = fileField({ maxFileSize: 2, fileTypes: ['image/*', '.pdf', 'application/zip'], maxFiles: 50 });
    const resolved = policy.resolveFieldPolicy(field);
    expect(resolved.maxBytes).toBe(2 * MB);
    expect(resolved.maxFiles).toBe(5);
    expect(resolved.allowedExtensions).toEqual(expect.arrayContaining(['jpg', 'png', 'pdf']));
    expect(resolved.allowedExtensions).not.toContain('docx');
    expect(resolved.allowedExtensions).not.toContain('zip');
    expect(() => policy.validateDeclaration({ field, filename: 'a.docx', size: 10 }))
      .toThrowError(expect.objectContaining({ code: 'FileTypeNotAllowed' }));
  });

  it('defaults to a single file per field', () => {
    expect(policy.resolveFieldPolicy(fileField()).maxFiles).toBe(1);
  });

  it('strips path parts and unsafe characters from file names', () => {
    expect(policy.sanitizeFilename('..\\..\\evil"name\r\n.pdf')).toBe('evilname.pdf');
    expect(policy.sanitizeFilename('/etc/passwd')).toBe('passwd');
  });
});

describe('form file retention', () => {
  it('defaults to 180 days and stays within 30 to 730 days', () => {
    const days = (value) => policy.resolveRetentionDays({ settings: { fileRetentionDays: value } });
    expect(policy.resolveRetentionDays({})).toBe(180);
    expect(days(undefined)).toBe(180);
    expect(days(0)).toBe(180);
    expect(days(90)).toBe(90);
    expect(days(1)).toBe(30);
    expect(days(100000)).toBe(730);
  });
});

describe('form upload content detection', () => {
  const samples = {
    jpeg: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]),
    png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]),
    gif: Buffer.from('GIF89a......', 'latin1'),
    webp: Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'latin1'),
    wav: Buffer.from('RIFF\x10\x00\x00\x00WAVEfmt ', 'latin1'),
    pdf: Buffer.from('%PDF-1.7\n%âãÏÓ\n', 'latin1'),
    ole: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]),
    rtf: Buffer.from('{\\rtf1\\ansi hello}', 'latin1'),
    ogg: Buffer.from('OggS\x00\x02', 'latin1'),
    mp3: Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0]),
    webm: Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]), Buffer.from('webm')]),
    text: Buffer.from('ad;soyad\nÇağrı;Öztürk\n', 'utf8')
  };

  it.each(Object.entries(samples))('detects %s', (kind, buffer) => {
    expect(policy.detectContentKind(buffer)).toBe(kind);
  });

  it('tells ISO media brands apart', () => {
    expect(policy.detectContentKind(ftyp('isom', ['isom', 'mp42']))).toBe('mp4');
    expect(policy.detectContentKind(ftyp('qt'))).toBe('mov');
    expect(policy.detectContentKind(ftyp('M4A', ['isom']))).toBe('m4a');
    expect(policy.detectContentKind(ftyp('heic', ['mif1']))).toBe('heic');
    expect(policy.detectContentKind(ftyp('mif1', ['avif']))).toBe('avif');
  });

  it('recognises Office and OpenDocument files inside their ZIP container', () => {
    expect(policy.detectContentKind(zip([['[Content_Types].xml'], ['word/document.xml']]))).toBe('docx');
    expect(policy.detectContentKind(zip([['[Content_Types].xml'], ['xl/workbook.xml']]))).toBe('xlsx');
    expect(policy.detectContentKind(zip([['[Content_Types].xml'], ['ppt/presentation.xml']]))).toBe('pptx');
    expect(policy.detectContentKind(zip([['mimetype', 'application/vnd.oasis.opendocument.text'], ['content.xml']]))).toBe('odt');
  });

  it('rejects a plain ZIP and a macro-enabled document renamed to .docx', () => {
    const plainZip = zip([['readme.txt', 'hi'], ['setup.exe', 'MZ']]);
    const macroDoc = zip([['[Content_Types].xml'], ['word/document.xml'], ['word/vbaProject.bin', 'x']]);
    expect(policy.verifyContent({ buffer: plainZip, extension: 'docx' })).toEqual({ ok: false, kind: 'zip' });
    expect(policy.verifyContent({ buffer: macroDoc, extension: 'docx' })).toEqual({ ok: false, kind: 'ooxml-macro' });
  });

  it('rejects content that does not match the declared extension', () => {
    const exe = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    expect(policy.verifyContent({ buffer: exe, extension: 'pdf' })).toEqual({ ok: false, kind: 'executable' });
    expect(policy.verifyContent({ buffer: samples.png, extension: 'jpg' }).ok).toBe(false);
    expect(policy.verifyContent({ buffer: samples.pdf, extension: 'txt' }).ok).toBe(false);
    expect(policy.verifyContent({ buffer: Buffer.from([0x00, 0x01, 0x02, 0x03]), extension: 'csv' }).ok).toBe(false);
  });

  it('accepts matching content, including legacy-encoded text', () => {
    expect(policy.verifyContent({ buffer: samples.jpeg, extension: 'jpeg' }).ok).toBe(true);
    expect(policy.verifyContent({ buffer: samples.ole, extension: 'xls' }).ok).toBe(true);
    expect(policy.verifyContent({ buffer: ftyp('isom'), extension: 'm4a' }).ok).toBe(true);
    const windows1254 = Buffer.from([0x41, 0x64, 0x3b, 0xc7, 0x61, 0xf0, 0x72, 0xfd, 0x0d, 0x0a]);
    expect(policy.verifyContent({ buffer: windows1254, extension: 'csv' }).ok).toBe(true);
  });
});

describe('publishing to the media library before scanning', () => {
  it('allows images, video, audio and PDF, but not Office or text files', () => {
    for (const ext of ['jpg', 'png', 'heic', 'mp4', 'mov', 'mp3', 'wav', 'pdf']) {
      expect(policy.isPromotableWithoutScan(ext)).toBe(true);
    }
    for (const ext of ['docx', 'xlsx', 'pptx', 'doc', 'odt', 'rtf', 'txt', 'csv', 'zip', 'exe']) {
      expect(policy.isPromotableWithoutScan(ext)).toBe(false);
    }
  });

  it('finds active content markers in a PDF', () => {
    const pdf = (body) => Buffer.from(`%PDF-1.7\n${body}\n%%EOF`, 'latin1');
    expect(policy.findPdfActiveContent(pdf('1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj'))).toEqual([]);
    expect(policy.findPdfActiveContent(pdf('<< /S /JavaScript /JS (app.alert(1)) >>'))).toEqual(['JavaScript', 'JS']);
    expect(policy.findPdfActiveContent(pdf('<< /S /Launch /F (cmd.exe) >>'))).toEqual(['Launch']);
    expect(policy.findPdfActiveContent(pdf('<< /Names << /EmbeddedFiles 5 0 R >> >>'))).toEqual(['EmbeddedFile']);
    expect(policy.findPdfActiveContent(pdf('<< /AcroForm << /XFA 9 0 R >> >>'))).toEqual(['XFA']);
    // Names that merely start with the same letters are not markers.
    expect(policy.findPdfActiveContent(pdf('<< /JSONData 1 /Launcher 2 >>'))).toEqual([]);
  });
});
