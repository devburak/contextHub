import GoogleIcon from './GoogleIcon.jsx'
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
      <GoogleIcon />
      {t('auth.google_continue')}
    </a>
  )
}
