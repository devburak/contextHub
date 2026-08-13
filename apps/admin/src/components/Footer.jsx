import { BookOpenIcon, GlobeAltIcon } from '@heroicons/react/24/outline'

export default function Footer({ showDeveloperDocs = false }) {
  const currentYear = new Date().getFullYear()
  
  // Basit dil değiştirme (şu an sadece Türkçe)
  const currentLang = 'TR'

  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-3 py-4 sm:grid-cols-3">
          {/* Language Selector - Left */}
          <div className="flex items-center">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <GlobeAltIcon className="h-4 w-4" />
              <span>Dil: {currentLang}</span>
            </div>
          </div>

          <div className="flex justify-center">
            {showDeveloperDocs && (
              <a
                href="/docs/overview"
                className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-blue-600 transition-colors hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                <BookOpenIcon className="h-4 w-4" aria-hidden="true" />
                <span>Geliştirici dokümantasyonu</span>
              </a>
            )}
          </div>

          {/* Brand - Right */}
          <div className="flex items-center gap-2 sm:justify-self-end">
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
