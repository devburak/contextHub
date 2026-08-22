import { useTranslation } from 'react-i18next'
import { BookOpenIcon } from '@heroicons/react/24/outline'

import LanguageSwitcher from './LanguageSwitcher.jsx'

/**
 * @param {boolean} showDeveloperDocs Geliştirici dokümantasyonu bağlantısını göster.
 * @param {boolean} authenticated Oturum açık mı. Açıksa dil tercihi kullanıcı
 *   profiline de yazılır; kapalıysa (login, şifre sıfırlama, davet ekranları)
 *   yalnızca bu cihazda saklanır — `PUT /users/me` orada 401 dönerdi.
 */
export default function Footer({ showDeveloperDocs = false, authenticated = false }) {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-3 py-4 lg:grid-cols-[auto_1fr_auto]">
          {/* Dil seçici - sol */}
          <div className="flex items-center">
            <LanguageSwitcher persistToProfile={authenticated} />
          </div>

          <nav
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs sm:text-sm"
            aria-label={t('footer.public_information')}
          >
            {showDeveloperDocs && (
              <a
                href="/docs/overview"
                className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <BookOpenIcon className="h-4 w-4" aria-hidden="true" />
                <span>{t('footer.developer_docs')}</span>
              </a>
            )}
            <a className="font-medium text-gray-600 hover:text-blue-700" href="/docs/pricing-and-plans">
              {t('footer.pricing')}
            </a>
            <a className="font-medium text-gray-600 hover:text-blue-700" href="/docs/terms-of-service">
              {t('footer.terms')}
            </a>
            <a className="font-medium text-gray-600 hover:text-blue-700" href="/docs/privacy-notice">
              {t('footer.privacy')}
            </a>
            <a className="font-medium text-gray-600 hover:text-blue-700" href="/docs/cancellation-and-refunds">
              {t('footer.refunds')}
            </a>
          </nav>

          {/* Marka - sağ */}
          <div className="flex items-center gap-2 lg:justify-self-end">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white text-xs font-bold">C</span>
            </div>
            <span className="text-sm text-gray-600">
              ContextHub © {currentYear}
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
