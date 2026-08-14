/**
 * Arayüz dili tercihinin tek doğruluk kaynağı.
 *
 * Öncelik sırası:
 *   1. Kullanıcı profilindeki `language` alanı (cihazdan bağımsız, sunucuda saklanır)
 *   2. localStorage (aynı cihazda hızlı önbellek, oturum açılmadan önce de geçerli)
 *   3. Tarayıcı dili (`navigator.languages`)
 *   4. DEFAULT_LOCALE
 *
 * Uygulama bilinçli olarak dili "her zaman Türkçe"ye sabitlemiyor: yabancı bir
 * müşterinin ilk açılışta Türkçe ekranla karşılaşmaması gerekiyor.
 */

export const SUPPORTED_LOCALES = ['tr', 'en']
export const DEFAULT_LOCALE = 'tr'
export const STORAGE_KEY = 'language'

/** `en-GB` → `en`, `TR` → `tr`, desteklenmiyorsa null. */
export function normalizeLocale(value) {
  if (!value || typeof value !== 'string') {
    return null
  }
  const primary = value.trim().toLowerCase().split('-')[0]
  return SUPPORTED_LOCALES.includes(primary) ? primary : null
}

function readStorage(storage) {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    // Safari private mode ve bazı gömülü tarayıcılarda localStorage erişimi throw eder.
    return null
  }
}

/**
 * Oturum açılmadan önce kullanılacak dil: localStorage → tarayıcı → varsayılan.
 */
export function detectInitialLocale({
  storage = typeof window !== 'undefined' ? window.localStorage : null,
  navigatorLanguages = typeof navigator !== 'undefined' ? navigator.languages : null,
  navigatorLanguage = typeof navigator !== 'undefined' ? navigator.language : null,
} = {}) {
  const stored = normalizeLocale(readStorage(storage))
  if (stored) {
    return stored
  }

  const candidates = Array.isArray(navigatorLanguages) && navigatorLanguages.length
    ? navigatorLanguages
    : [navigatorLanguage]

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate)
    if (normalized) {
      return normalized
    }
  }

  return DEFAULT_LOCALE
}

/**
 * Kullanıcı profili yüklendikten sonraki etkin dil. Profil tercihi varsa o kazanır.
 */
export function resolveUserLocale(user, fallback = DEFAULT_LOCALE) {
  return normalizeLocale(user?.language) || normalizeLocale(fallback) || DEFAULT_LOCALE
}

export function persistLocale(locale, storage = typeof window !== 'undefined' ? window.localStorage : null) {
  const normalized = normalizeLocale(locale)
  if (!normalized) {
    return null
  }
  try {
    storage?.setItem(STORAGE_KEY, normalized)
  } catch {
    // Yazılamıyorsa sessizce geç; dil yine de bu oturum boyunca bellekte geçerli kalır.
  }
  return normalized
}

/** API isteklerinde gönderilecek dil; i18n başlatılmadan önce de çağrılabilir. */
export function getActiveLocale(storage = typeof window !== 'undefined' ? window.localStorage : null) {
  return normalizeLocale(readStorage(storage)) || DEFAULT_LOCALE
}
