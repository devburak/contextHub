import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GlobeAltIcon } from '@heroicons/react/24/outline'

import { SUPPORTED_LOCALES, persistLocale } from '../lib/localePreference.js'
import { usersAPI } from '../lib/api.js'

const NATIVE_LABEL = {
  tr: 'Türkçe',
  en: 'English',
}

/**
 * Dil seçici.
 *
 * Seçim üç yere yazılır:
 *   1. i18next (anında arayüz değişimi)
 *   2. localStorage (aynı cihazda sonraki açılış ve API `X-Locale` başlığı)
 *   3. Kullanıcı profili (`PUT /users/me`) — diğer cihazlara da taşınsın diye
 *
 * Profil yazımı başarısız olursa arayüz dili yine de değişir; kullanıcıyı
 * engellemek yerine tercihin yalnızca bu cihazda geçerli olduğu bildirilir.
 *
 * @param {boolean} persistToProfile Oturum açılmamış ekranlarda (login, şifre
 *   sıfırlama) false verilmeli — o noktada `PUT /users/me` 401 döner.
 */
export default function LanguageSwitcher({
  persistToProfile = true,
  variant = 'inline',
  className = '',
}) {
  const { t, i18n } = useTranslation()
  const [notice, setNotice] = useState('')

  const current = SUPPORTED_LOCALES.includes(i18n.language) ? i18n.language : SUPPORTED_LOCALES[0]

  const changeLanguage = useCallback(
    async (locale) => {
      if (!SUPPORTED_LOCALES.includes(locale) || locale === current) {
        return
      }

      setNotice('')
      await i18n.changeLanguage(locale)
      persistLocale(locale)

      if (!persistToProfile) {
        return
      }

      try {
        await usersAPI.updateOwnProfile({ language: locale })
      } catch {
        // Profil güncellenemedi: dil bu cihazda geçerli kalır, kullanıcı bilgilendirilir.
        setNotice(t('language.save_failed'))
      }
    },
    [current, i18n, persistToProfile, t]
  )

  if (variant === 'select') {
    return (
      <div className={className}>
        <label htmlFor="language-select" className="block text-sm font-medium text-gray-700">
          {t('profile.language')}
        </label>
        <select
          id="language-select"
          value={current}
          onChange={(event) => changeLanguage(event.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm"
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {NATIVE_LABEL[locale]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-sm text-gray-500">{t('profile.language_hint')}</p>
        {notice && <p className="mt-1 text-sm text-amber-600">{notice}</p>}
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <GlobeAltIcon className="h-4 w-4 text-gray-500" aria-hidden="true" />
      <span className="sr-only">{t('language.select')}</span>
      <div className="flex items-center gap-1" role="group" aria-label={t('language.select')}>
        {SUPPORTED_LOCALES.map((locale) => (
          <button
            key={locale}
            type="button"
            onClick={() => changeLanguage(locale)}
            aria-current={locale === current ? 'true' : undefined}
            className={`rounded px-2 py-1 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              locale === current
                ? 'bg-gray-100 font-medium text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {locale.toUpperCase()}
          </button>
        ))}
      </div>
      {notice && <span className="text-xs text-amber-600">{notice}</span>}
    </div>
  )
}
