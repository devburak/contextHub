import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { authAPI } from '../../lib/api.js'
import { useApiError } from '../../lib/useApiError.js'
import Footer from '../../components/Footer.jsx'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const describeError = useApiError()
  const token = searchParams.get('token')

  const [status, setStatus] = useState('loading') // loading, success, error
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMessage(t('verify.invalid_link'))
      return
    }

    const verifyEmail = async () => {
      try {
        await authAPI.verifyEmail(token)
        setStatus('success')
        // 3 saniye sonra login sayfasına yönlendir
        setTimeout(() => {
          navigate('/login', {
            state: { message: t('verify.success_signin') }
          })
        }, 3000)
      } catch (error) {
        setStatus('error')
        setErrorMessage(describeError(error, 'verify.failed'))
      }
    }

    verifyEmail()
    // Dil değişiminde doğrulama isteği tekrarlanmasın: yalnızca token/navigate izlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, navigate])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100">
                <svg className="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                {t('verify.verifying')}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {t('auth.please_wait')}
              </p>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  if (status === 'success') {
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
                {t('verify.success_title')}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {t('verify.success_redirecting')}
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

  // status === 'error'
  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              {t('verify.failed_title')}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {errorMessage}
            </p>
            <div className="mt-6 space-y-3">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-500"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                {t('forgot.back_to_login')}
              </Link>
              <p className="text-xs text-gray-500">
                {t('verify.expired_hint')}
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
