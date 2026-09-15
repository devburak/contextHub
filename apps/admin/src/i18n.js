import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, detectInitialLocale, persistLocale } from './lib/localePreference.js'

import trCommon from './locales/tr/common.json'
import trNav from './locales/tr/nav.json'
import trAuth from './locales/tr/auth.json'
import trUsers from './locales/tr/users.json'
import trProfile from './locales/tr/profile.json'
import trErrors from './locales/tr/errors.json'
import trValidation from './locales/tr/validation.json'
import trContent from './locales/tr/content.json'
import trMedia from './locales/tr/media.json'
import trCollections from './locales/tr/collections.json'
import trForms from './locales/tr/forms.json'
import trMenus from './locales/tr/menus.json'
import trPlacements from './locales/tr/placements.json'
import trTenants from './locales/tr/tenants.json'
import trDashboard from './locales/tr/dashboard.json'
import trComponents from './locales/tr/components.json'
import trBilling from './locales/tr/billing.json'

import enCommon from './locales/en/common.json'
import enNav from './locales/en/nav.json'
import enAuth from './locales/en/auth.json'
import enUsers from './locales/en/users.json'
import enProfile from './locales/en/profile.json'
import enErrors from './locales/en/errors.json'
import enValidation from './locales/en/validation.json'
import enContent from './locales/en/content.json'
import enMedia from './locales/en/media.json'
import enCollections from './locales/en/collections.json'
import enForms from './locales/en/forms.json'
import enMenus from './locales/en/menus.json'
import enPlacements from './locales/en/placements.json'
import enTenants from './locales/en/tenants.json'
import enDashboard from './locales/en/dashboard.json'
import enComponents from './locales/en/components.json'
import enBilling from './locales/en/billing.json'

/**
 * Çeviriler alan bazında ayrı JSON dosyalarında tutulur ama tek bir i18next
 * namespace'ine düz (flat) anahtarlarla yüklenir.
 *
 * `keySeparator` ve `nsSeparator` bilinçli olarak kapalı: anahtarlar
 * `'users.title'` gibi nokta içeriyor ve bunlar iç içe bir yol değil, birebir
 * anahtar olarak aranmalı. Böylece bir anahtarın hangi dosyada yaşadığı çağrı
 * yerini etkilemez; dosyaları bölmek ya da birleştirmek kırılma yaratmaz.
 */
function bundle(...parts) {
  return { translation: Object.assign({}, ...parts) }
}

const resources = {
  tr: bundle(trCommon, trNav, trAuth, trUsers, trProfile, trErrors, trValidation, trContent, trMedia, trCollections, trForms, trMenus, trPlacements, trTenants, trDashboard, trComponents, trBilling),
  en: bundle(enCommon, enNav, enAuth, enUsers, enProfile, enErrors, enValidation, enContent, enMedia, enCollections, enForms, enMenus, enPlacements, enTenants, enDashboard, enComponents, enBilling),
}

const initialLocale = detectInitialLocale()

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: initialLocale,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: SUPPORTED_LOCALES,
    keySeparator: false,
    nsSeparator: false,
    debug: false,
    interpolation: {
      escapeValue: false,
    },
    react: {
      useSuspense: false,
    },
  })

// İlk tespit edilen dili sabitle: kullanıcı sonradan tarayıcı dilini değiştirse
// bile panel dili kendiliğinden değişmesin.
persistLocale(initialLocale)

if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('lang', initialLocale)
  i18n.on('languageChanged', (locale) => {
    document.documentElement.setAttribute('lang', locale)
  })
}

export default i18n
