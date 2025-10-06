import { GlobeAltIcon } from '@heroicons/react/24/outline'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  
  // Basit dil değiştirme (şu an sadece Türkçe)
  const currentLang = 'TR'

  return (
    <footer className="bg-white border-t border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          {/* Language Selector - Left */}
          <div className="flex items-center">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <GlobeAltIcon className="h-4 w-4" />
              <span>Dil: {currentLang}</span>
            </div>
          </div>

          {/* Brand - Right */}
          <div className="flex items-center gap-2">
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
