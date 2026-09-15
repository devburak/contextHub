#!/usr/bin/env node
/**
 * Çeviri boşluğu raporu.
 *
 *   node scripts/i18n-report.mjs            # özet
 *   node scripts/i18n-report.mjs --verbose  # dosya dosya hardcoded metin adayları
 *
 * İki şeyi ölçer:
 *   1. Diller arası eksik anahtarlar (tr'de var en'de yok, ya da tersi)
 *   2. Hâlâ çevrilmemiş görünen metin adayları — JSX metin düğümleri, kullanıcıya
 *      dönük attribute'lar ve toast/alert çağrıları
 *
 * Sezgisel bir araçtır: yanlış pozitif üretebilir. Amaç kalan işi ölçmek,
 * CI'ı kırmak değil — bu yüzden bulgu olsa da 0 ile çıkar.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const localesDir = path.join(repoRoot, 'apps/admin/src/locales');
const sourceDir = path.join(repoRoot, 'apps/admin/src');

// Lexical editörün iç yüzeyi bilinçli olarak kapsam dışı (bkz. docs/I18N.md §7).
const EXCLUDED = [
  path.join(sourceDir, 'pages/contents/plugins'),
  path.join(sourceDir, 'pages/contents/nodes'),
  path.join(sourceDir, 'locales'),
];

const verbose = process.argv.includes('--verbose');

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (EXCLUDED.some((excluded) => full.startsWith(excluded))) continue;
    if (entry.isDirectory()) {
      await walk(full, files);
    } else if (/\.(jsx?|mjs)$/.test(entry.name) && !/\.test\.[jm]sx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

async function loadLocale(lang) {
  const dir = path.join(localesDir, lang);
  if (!existsSync(dir)) return {};
  const merged = {};
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(await readFile(path.join(dir, file), 'utf8'));
    for (const [key, value] of Object.entries(data)) {
      merged[key] = { value, file };
    }
  }
  return merged;
}

// Kullanıcıya görünen metin adayları. Tek kelimelik teknik dizeleri ve
// sınıf adlarını elemek için en az bir boşluk veya 4+ harf arıyoruz.
const TEXT_NODE = />\s*([A-ZĞÜŞİÖÇ][^<>{}\n]{3,80}?)\s*</g;
const ATTRIBUTE = /\b(placeholder|title|aria-label|alt)="([^"]{4,80})"/g;
const NOTIFY = /\b(?:toast\.\w+|alert|confirm)\(\s*['"`]([^'"`]{4,120})['"`]/g;

function findHardcoded(source) {
  const hits = [];
  for (const [, text] of source.matchAll(TEXT_NODE)) {
    if (!/^[A-Z0-9_\-.]+$/.test(text)) hits.push(text.trim());
  }
  for (const [, , text] of source.matchAll(ATTRIBUTE)) hits.push(text.trim());
  for (const [, text] of source.matchAll(NOTIFY)) hits.push(text.trim());
  return hits;
}

const tr = await loadLocale('tr');
const en = await loadLocale('en');

const missingInEn = Object.keys(tr).filter((key) => !(key in en)).sort();
const missingInTr = Object.keys(en).filter((key) => !(key in tr)).sort();
const identical = Object.keys(tr)
  .filter((key) => key in en && tr[key].value === en[key].value)
  .filter((key) => !/^(footer\.contexthub|language\.)/.test(key))
  .sort();

const files = await walk(sourceDir);
let totalHits = 0;
const perFile = [];

for (const file of files) {
  const source = await readFile(file, 'utf8');
  const hits = findHardcoded(source);
  if (hits.length) {
    totalHits += hits.length;
    perFile.push({ file: path.relative(repoRoot, file), hits });
  }
}

perFile.sort((a, b) => b.hits.length - a.hits.length);

console.log('\n=== Çeviri anahtarları ===');
console.log(`tr: ${Object.keys(tr).length}   en: ${Object.keys(en).length}`);
console.log(`en'de eksik: ${missingInEn.length}   tr'de eksik: ${missingInTr.length}`);
if (missingInEn.length) console.log('  en eksik →', missingInEn.slice(0, 20).join(', '));
if (missingInTr.length) console.log('  tr eksik →', missingInTr.slice(0, 20).join(', '));
if (identical.length) {
  console.log(`\nİki dilde birebir aynı olan ${identical.length} anahtar (çevrilmemiş olabilir):`);
  console.log('  ' + identical.slice(0, 20).join(', '));
}

console.log('\n=== Hardcoded metin adayları ===');
console.log(`${perFile.length} dosyada ${totalHits} aday`);
for (const entry of perFile.slice(0, verbose ? perFile.length : 15)) {
  console.log(`  ${String(entry.hits.length).padStart(4)}  ${entry.file}`);
  if (verbose) {
    for (const hit of entry.hits) console.log(`         · ${hit}`);
  }
}
if (!verbose && perFile.length > 15) {
  console.log(`  ... ve ${perFile.length - 15} dosya daha (--verbose ile tamamı)`);
}
console.log('');
