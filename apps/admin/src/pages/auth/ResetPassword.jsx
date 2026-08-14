import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { authAPI } from '../../lib/api.js'
import { useApiError } from '../../lib/useApiError.js'
import Footer from '../../components/Footer.jsx'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const describeError = useApiError()
  const token = searchParams.get('token')
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const resetPasswordMutation = useMutation({
    mutationFn: ({ token, password }) => authAPI.resetPassword(token, password),
    onSuccess: () => {
      // Başarılı, login sayfasına yönlendir
      setTimeout(() => {
        navigate('/login', {
          state: { message: t('reset.success') }
        })
      }, 2000)
    },
    onError: (error) => {
      setError(describeError(error, 'reset.failed'))
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')

    // Validasyon
    if (password.length < 6) {
      setError(t('validation.min_length', { count: 6 }))
      return
    }

    if (password !== confirmPassword) {
      setError(t('validation.passwords_match'))
      return
    }

    if (!token) {
      setError(t('reset.invalid_link'))
      return
    }

    resetPasswordMutation.mutate({ token, password })
  }

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                {t('reset.invalid_link_title')}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {t('reset.invalid_link')}
              </p>
              <div className="mt-6">
                <Link
                  to="/forgot-password"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  {t('reset.request_new_link')}
                </Link>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (resetPasswordMutation.isSuccess) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                {t('reset.success_title')}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {t('reset.success_redirecting')}
              </p>
              <div className="mt-6">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  {t('verify.go_to_login')}
                </Link>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              {t('reset.title')}
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              {t('reset.description')}
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  {t('reset.new_password')}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder={t('reset.password_placeholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  {t('reset.confirm_password')}
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                  placeholder={t('reset.confirm_placeholder')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="text-sm text-red-800">{error}</div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={resetPasswordMutation.isPending}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {resetPasswordMutation.isPending ? t('reset.submitting') : t('reset.submit')}
              </button>
            </div>

            <div className="text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                {t('forgot.back_to_login')}
              </Link>
            </div>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  )
}
