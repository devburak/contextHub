import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LOCALE,
  detectInitialLocale,
  getActiveLocale,
  normalizeLocale,
  persistLocale,
  resolveUserLocale,
} from './localePreference.js'

function memoryStorage(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => {
      data[key] = String(value)
    },
    data,
  }
}

const throwingStorage = {
  getItem() {
    throw new Error('SecurityError: localStorage is not available')
  },
  setItem() {
    throw new Error('SecurityError: localStorage is not available')
  },
}

describe('normalizeLocale', () => {
  it('reduces regional tags', () => {
    expect(normalizeLocale('en-GB')).toBe('en')
    expect(normalizeLocale('tr-TR')).toBe('tr')
    expect(normalizeLocale(' EN ')).toBe('en')
  })

  it('rejects unsupported values', () => {
    expect(normalizeLocale('de')).toBeNull()
    expect(normalizeLocale('')).toBeNull()
    expect(normalizeLocale(undefined)).toBeNull()
  })
})

describe('detectInitialLocale', () => {
  it('prefers a stored preference over the browser language', () => {
    const locale = detectInitialLocale({
      storage: memoryStorage({ language: 'en' }),
      navigatorLanguages: ['tr-TR', 'tr'],
    })
    expect(locale).toBe('en')
  })

  it('falls back to the browser language when nothing is stored', () => {
    const locale = detectInitialLocale({
      storage: memoryStorage(),
      navigatorLanguages: ['en-US', 'en'],
    })
    expect(locale).toBe('en')
  })

  it('skips unsupported browser languages', () => {
    const locale = detectInitialLocale({
      storage: memoryStorage(),
      navigatorLanguages: ['de-DE', 'fr-FR', 'tr'],
    })
    expect(locale).toBe('tr')
  })

  it('falls back to the default when the browser offers nothing usable', () => {
    const locale = detectInitialLocale({
      storage: memoryStorage(),
      navigatorLanguages: ['de-DE'],
      navigatorLanguage: null,
    })
    expect(locale).toBe(DEFAULT_LOCALE)
  })

  it('uses navigator.language when navigator.languages is empty', () => {
    const locale = detectInitialLocale({
      storage: memoryStorage(),
      navigatorLanguages: [],
      navigatorLanguage: 'en-AU',
    })
    expect(locale).toBe('en')
  })

  it('does not throw when storage access is blocked', () => {
    expect(() =>
      detectInitialLocale({ storage: throwingStorage, navigatorLanguages: ['en'] })
    ).not.toThrow()
    expect(detectInitialLocale({ storage: throwingStorage, navigatorLanguages: ['en'] })).toBe('en')
  })
})

describe('resolveUserLocale', () => {
  it('prefers the profile preference', () => {
    expect(resolveUserLocale({ language: 'en' }, 'tr')).toBe('en')
  })

  it('falls back when the profile has no preference', () => {
    expect(resolveUserLocale({ language: null }, 'en')).toBe('en')
    expect(resolveUserLocale(null, 'en')).toBe('en')
  })

  it('ignores an unsupported profile value', () => {
    expect(resolveUserLocale({ language: 'de' }, 'en')).toBe('en')
  })

  it('lands on the default when both inputs are unusable', () => {
    expect(resolveUserLocale({ language: 'de' }, 'fr')).toBe(DEFAULT_LOCALE)
  })
})

describe('persistLocale', () => {
  it('stores a normalised value', () => {
    const storage = memoryStorage()
    expect(persistLocale('en-US', storage)).toBe('en')
    expect(storage.data.language).toBe('en')
  })

  it('refuses unsupported values without writing', () => {
    const storage = memoryStorage()
    expect(persistLocale('de', storage)).toBeNull()
    expect(storage.data.language).toBeUndefined()
  })

  it('does not throw when storage is blocked', () => {
    expect(() => persistLocale('en', throwingStorage)).not.toThrow()
    expect(persistLocale('en', throwingStorage)).toBe('en')
  })
})

describe('getActiveLocale', () => {
  it('reads the stored locale', () => {
    expect(getActiveLocale(memoryStorage({ language: 'en' }))).toBe('en')
  })

  it('falls back to the default', () => {
    expect(getActiveLocale(memoryStorage())).toBe(DEFAULT_LOCALE)
    expect(getActiveLocale(throwingStorage)).toBe(DEFAULT_LOCALE)
  })
})
