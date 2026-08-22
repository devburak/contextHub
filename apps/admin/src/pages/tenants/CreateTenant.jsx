import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { tenantAPI } from '../../lib/tenantAPI.js'
import { useApiError } from '../../lib/useApiError.js'
import { useAuth } from '../../contexts/AuthContext.jsx'

const initialFormState = {
  name: '',
  slug: ''
}

export default function CreateTenant() {
  const [formData, setFormData] = useState(initialFormState)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { refreshSession } = useAuth()
  const { t } = useTranslation()
  const describeError = useApiError()

  const createMutation = useMutation({
    mutationFn: tenantAPI.createTenant,
    onMutate: () => {
      setError('')
      setSuccessMessage('')
    },
    onSuccess: async ({ tenant }) => {
      await refreshSession()
      setSuccessMessage(t('tenant.created_success', { name: tenant.name }))
      setFormData(initialFormState)
      queryClient.invalidateQueries({ queryKey: ['tenants', 'list'] })

      setTimeout(() => {
        navigate('/varliklar')
      }, 1200)
    },
    onError: (err) => {
      setError(describeError(err, 'tenant.create_failed'))
    }
  })

  const handleChange = (event) => {
    const { name, value } = event.target
    setFormData((prev) => {
      const next = { ...prev, [name]: value }
      if (name === 'name') {
        next.slug = value
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim()
      }
      return next
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!formData.name.trim()) {
      setError(t('validation.required_named', { field: t('tenant.name_label') }))
      return
    }

    createMutation.mutate({
      name: formData.name.trim(),
      slug: formData.slug.trim() || undefined,
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('tenant.create_new')}</h1>
        <p className="mt-2 text-sm text-gray-600">
          {t('tenant.create_subtitle')}
        </p>
      </div>

      <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-6">
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              {t('tenant.name_label')}
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              className="input"
              placeholder={t('tenant.name_placeholder')}
            />
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
              {t('common.slug')}
            </label>
            <input
              id="slug"
              name="slug"
              type="text"
              value={formData.slug}
              onChange={handleChange}
              className="input"
              placeholder={t('tenant.slug_placeholder')}
            />
            <p className="mt-1 text-xs text-gray-500">{t('tenant.slug_hint')}</p>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-950">Free paket ile güvenli başlangıç</p>
            <p className="mt-1 text-sm text-blue-800">Varlık oluşturulduktan sonra tenant owner, Faturalandırma ekranındaki hosted checkout üzerinden paket seçebilir.</p>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="rounded-md bg-green-50 border border-green-200 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">{successMessage}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
            <Link
              to="/varliklar"
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {t('common.cancel')}
            </Link>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createMutation.isPending ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('tenant.creating')}
                </>
              ) : (
                t('tenant.create_submit')
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
