import { useState } from 'react'
import { ExternalLink, FileJson, MousePointerClick, RefreshCw, Server, ShieldCheck } from 'lucide-react'

const placementEndpoints = [
  {
    method: 'POST',
    path: '/api/public/placements/decide',
    label: 'Decision engine',
    description: 'Uygun experience, content, ui, trigger ve tracking context döner.'
  },
  {
    method: 'GET',
    path: '/api/public/placements/:slug',
    label: 'Public details',
    description: 'Custom renderer veya presentation katmanı için aktif experience yapısını verir.'
  },
  {
    method: 'POST',
    path: '/api/public/placements/event',
    label: 'Analytics event',
    description: 'Impression, view, click, close, dismiss, submit, conversion ve error eventlerini işler.'
  },
  {
    method: 'POST',
    path: '/api/public/forms/:formId/submit',
    label: 'Form submit',
    description: 'Form placement içerisinden dönen submitEndpoint bu public endpointi hedefler.'
  }
]

export default function ApiDocs() {
  const [iframeKey, setIframeKey] = useState(0)
  const [apiUrl] = useState(() => {
    // Get API base URL from environment or default to localhost:3000
    return import.meta.env.VITE_API_URL || 'http://localhost:3000'
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
                <FileJson className="w-6 h-6 text-blue-600" />
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
                <ShieldCheck className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Authentication</p>
                <p className="text-sm font-semibold text-gray-900">JWT, API Token, Tenant Header</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <Server className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase">Base URL</p>
                <p className="text-sm font-semibold text-gray-900">{apiUrl}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Placement Reference */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <MousePointerClick size={18} className="text-gray-700" />
            <h2 className="text-sm font-semibold text-gray-900">Placement Public API</h2>
            <span className="text-xs text-gray-500">
              Popup, inline, custom view ve form tabanlı presentation akışları
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
            {placementEndpoints.map((endpoint) => (
              <div key={`${endpoint.method}-${endpoint.path}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {endpoint.method}
                  </span>
                  <span className="text-xs font-semibold text-gray-900">{endpoint.label}</span>
                </div>
                <code className="mt-2 block break-all text-xs text-blue-700">{endpoint.path}</code>
                <p className="mt-2 text-xs leading-5 text-gray-600">{endpoint.description}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Public placement isteklerinde tenant için `X-Tenant-ID`; SDK tarafında ise `tenantId` ve gerekiyorsa `apiKey` kullanılmalı.
          </p>
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
