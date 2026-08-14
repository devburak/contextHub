import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  hasErrorCode,
  normalizeLocale,
  parseAcceptLanguage,
  resolveLocale,
  translateErrorCode,
} = require('./index.js');
const trMessages = require('./locales/tr.json');
const enMessages = require('./locales/en.json');

describe('locale normalisation', () => {
  it('reduces regional tags to a supported primary language', () => {
    expect(normalizeLocale('en-GB')).toBe('en');
    expect(normalizeLocale('TR')).toBe('tr');
    expect(normalizeLocale('tr-TR')).toBe('tr');
  });

  it('returns null for unsupported or malformed values', () => {
    expect(normalizeLocale('de')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale(42)).toBeNull();
  });
});

describe('Accept-Language parsing', () => {
  it('honours q-values rather than header order', () => {
    expect(parseAcceptLanguage('tr;q=0.3, en;q=0.9')).toBe('en');
  });

  it('skips unsupported languages and falls through to a supported one', () => {
    expect(parseAcceptLanguage('de-DE, fr;q=0.8, tr;q=0.5')).toBe('tr');
  });

  it('ignores entries with q=0', () => {
    expect(parseAcceptLanguage('en;q=0, tr;q=0.4')).toBe('tr');
  });

  it('returns null when nothing matches', () => {
    expect(parseAcceptLanguage('de, fr')).toBeNull();
    expect(parseAcceptLanguage('')).toBeNull();
  });
});

describe('resolveLocale precedence', () => {
  it('prefers the authenticated user preference over headers', () => {
    const request = {
      user: { language: 'en' },
      headers: { 'x-locale': 'tr', 'accept-language': 'tr' },
    };
    expect(resolveLocale(request)).toBe('en');
  });

  it('falls back to the explicit X-Locale header', () => {
    const request = { headers: { 'x-locale': 'en', 'accept-language': 'tr' } };
    expect(resolveLocale(request)).toBe('en');
  });

  it('falls back to Accept-Language', () => {
    expect(resolveLocale({ headers: { 'accept-language': 'en-US,en;q=0.9' } })).toBe('en');
  });

  it('falls back to the default locale when no signal is present', () => {
    expect(resolveLocale({ headers: {} })).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  it('ignores an unsupported user preference instead of throwing', () => {
    const request = { user: { language: 'de' }, headers: { 'accept-language': 'en' } };
    expect(resolveLocale(request)).toBe('en');
  });
});

describe('error catalogue', () => {
  it('exposes the same set of codes in every locale', () => {
    expect(Object.keys(enMessages).sort()).toEqual(Object.keys(trMessages).sort());
  });

  it('has a non-empty translation for every code in every locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [code, message] of Object.entries(locale === 'tr' ? trMessages : enMessages)) {
        expect(typeof message, `${locale}.${code}`).toBe('string');
        expect(message.trim().length, `${locale}.${code}`).toBeGreaterThan(0);
      }
    }
  });

  it('translates a known code per locale', () => {
    expect(translateErrorCode('ContentNotFound', 'tr')).toBe('İçerik bulunamadı.');
    expect(translateErrorCode('ContentNotFound', 'en')).toBe('Content not found.');
  });

  it('returns null for unknown codes so callers can keep the original message', () => {
    expect(translateErrorCode('NoSuchCode', 'tr')).toBeNull();
    expect(translateErrorCode('', 'tr')).toBeNull();
    expect(translateErrorCode(undefined, 'tr')).toBeNull();
  });

  it('falls back to the default locale for an unsupported locale argument', () => {
    expect(translateErrorCode('ContentNotFound', 'de')).toBe(trMessages.ContentNotFound);
  });

  it('reports code membership', () => {
    expect(hasErrorCode('ContentNotFound')).toBe(true);
    expect(hasErrorCode('Bad Request')).toBe(false);
    expect(hasErrorCode(null)).toBe(false);
  });
});
