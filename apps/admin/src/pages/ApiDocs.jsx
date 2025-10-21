import { useState, useEffect } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'

export default function ApiDocs() {
  const [iframeKey, setIframeKey] = useState(0)
  const [apiUrl] = useState(() => {
    // Get API base URL from environment or default to localhost:3000
    return import.meta.env.VITE_API_ || 'http://localhost:3000'
  })

  const docsUrl = `${apiUrl}/docs`

  const handleRefresh = () => {
    setIframeKey(prev => prev + 1)
  }

  const handleOpenInNewTab = () => {
    window.open(docsUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">API Dokümantasyonu</h1>
            <p className="mt-1 text-sm text-gray-600">
              ContextHub API endpoint'lerini keşfedin ve test edin
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              title="Yenile"
            >
              <RefreshCw size={16} />
              Yenile
            </button>
            <button
              onClick={handleOpenInNewTab}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
              title="Yeni sekmede aç"
            >
              <ExternalLink size={16} />
              Yeni Sekmede Aç
            </button>
          </div>
        </div>
      </div>

      {/* Info Cards */}
      <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Format</p>
                <p className="text-sm font-semibold text-gray-900">OpenAPI 3.0.3</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Authentication</p>
                <p className="text-sm font-semibold text-gray-900">JWT Bearer Token</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Base URL</p>
                <p className="text-sm font-semibold text-gray-900">{apiUrl}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-600 font-medium">Hızlı Erişim:</span>
          <a
            href={`${apiUrl}/docs/json`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            OpenAPI JSON
          </a>
          <span className="text-gray-300">|</span>
          <a
            href={`${apiUrl}/docs/yaml`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            OpenAPI YAML
          </a>
          <span className="text-gray-300">|</span>
          <a
            href="https://swagger.io/tools/swagger-codegen/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 hover:underline"
          >
            Code Generator
          </a>
        </div>
      </div>

      {/* Swagger UI Iframe */}
      <div className="flex-1 relative bg-white">
        <iframe
          key={iframeKey}
          src={docsUrl}
          className="absolute inset-0 w-full h-full border-0"
          title="API Documentation"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </div>
  )
}
