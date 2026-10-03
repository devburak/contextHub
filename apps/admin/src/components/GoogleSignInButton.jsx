import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiClient } from '../lib/api.js'

export default function GoogleSignInButton() {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    let active = true
    apiClient.get('/auth/google/config').then(({ data }) => {
      if (active) setEnabled(data.enabled)
    }).catch(() => {})
    return () => { active = false }
  }, [])
  if (!enabled) return null
  return (
    <a href={`${apiClient.defaults.baseURL}/auth/google/start`}
      className="flex w-full items-center justify-center gap-3 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
      <svg aria-hidden="true" className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
        <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.12H3.04v2.59A10 10 0 0 0 12 22Z" />
        <path fill="#FBBC05" d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.49H3.04A10 10 0 0 0 2 12c0 1.61.38 3.14 1.04 4.51l3.35-2.59Z" />
        <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.49l3.35 2.59C7.18 7.72 9.39 5.96 12 5.96Z" />
      </svg>
      {t('auth.google_continue')}
    </a>
  )
}
