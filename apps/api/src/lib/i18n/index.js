'use strict';

/**
 * Sunucu tarafı yerelleştirme.
 *
 * Hata yanıtları zaten makine-okunur bir `error` kodu taşıyor
 * (örn. `{ error: 'ContentNotFound', message: '...' }`). Bu modül o kodları
 * kullanıcıya gösterilebilir metinlere çevirir. Kod sözleşmenin kalıcı parçasıdır;
 * çeviri yalnızca sunum katmanıdır ve istemciler koda göre dallanmaya devam etmelidir.
 *
 * Dil çözümleme önceliği:
 *   1. Kimliği doğrulanmış kullanıcının `language` tercihi
 *   2. `X-Locale` başlığı (admin panelinin açıkça gönderdiği değer)
 *   3. `Accept-Language` başlığı (q-değerlerine göre sıralı)
 *   4. DEFAULT_LOCALE
 */

const trMessages = require('./locales/tr.json');
const enMessages = require('./locales/en.json');

const SUPPORTED_LOCALES = Object.freeze(['tr', 'en']);
const DEFAULT_LOCALE = 'tr';

const CATALOGS = Object.freeze({
  tr: trMessages,
  en: enMessages,
});

/**
 * Bir dil etiketini desteklenen bir locale'e indirger.
 * `en-GB` → `en`, `TR` → `tr`, bilinmeyen → null.
 */
function normalizeLocale(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const primary = value.trim().toLowerCase().split('-')[0];
  return SUPPORTED_LOCALES.includes(primary) ? primary : null;
}

/**
 * `Accept-Language` başlığını q-değerine göre sıralayıp desteklenen ilk dili döner.
 */
function parseAcceptLanguage(header) {
  if (!header || typeof header !== 'string') {
    return null;
  }

  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((param) => param.trim().startsWith('q='));
      const parsedQ = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      const quality = Number.isFinite(parsedQ) ? parsedQ : 0;
      return { tag: tag.trim(), quality };
    })
    .filter((candidate) => candidate.tag && candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate.tag);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/**
 * İstek için etkin locale'i çözer. Hiçbir sinyal yoksa DEFAULT_LOCALE döner.
 */
function resolveLocale(request) {
  const headers = request?.headers || {};

  return (
    normalizeLocale(request?.user?.language)
    || normalizeLocale(headers['x-locale'])
    || parseAcceptLanguage(headers['accept-language'])
    || DEFAULT_LOCALE
  );
}

/**
 * Bir hata kodunu çevirir. Katalogda yoksa null döner — çağıran taraf
 * özgün mesajı korumaya karar verebilsin diye bilinçli olarak `null`.
 */
function translateErrorCode(code, locale = DEFAULT_LOCALE) {
  if (!code || typeof code !== 'string') {
    return null;
  }

  const catalog = CATALOGS[normalizeLocale(locale) || DEFAULT_LOCALE];
  return catalog[code] || null;
}

function hasErrorCode(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CATALOGS[DEFAULT_LOCALE], code);
}

module.exports = {
  CATALOGS,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  hasErrorCode,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  translateErrorCode,
};
