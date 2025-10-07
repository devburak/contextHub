import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import { authAPI } from '../../lib/api.js'
import Footer from '../../components/Footer.jsx'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isSubmitted, setIsSubmitted] = useState(false)

  const forgotPasswordMutation = useMutation({
    mutationFn: (email) => authAPI.forgotPassword(email),
    onSuccess: () => {
      setIsSubmitted(true)
    },
    onError: (error) => {
      console.error('Forgot password failed:', error.response?.data?.message || error.message)
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    forgotPasswordMutation.mutate(email)
  }

  if (isSubmitted) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            <div className="text-center">
              <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
                E-postanızı kontrol edin
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                Şifre sıfırlama bağlantısı <strong>{email}</strong> adresine gönderildi
              </p>
              <p className="mt-4 text-sm text-gray-600">
                E-posta almadınız mı?{' '}
                <button
                  onClick={() => setIsSubmitted(false)}
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  Tekrar deneyin
                </button>
              </p>
              <div className="mt-6">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Giriş sayfasına dön
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
              Şifrenizi mi unuttunuz?
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim
            </p>
          </div>
          
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="email" className="sr-only">
                E-posta
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="E-posta"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <button
                type="submit"
                disabled={forgotPasswordMutation.isPending}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {forgotPasswordMutation.isPending ? 'Gönderiliyor...' : 'Şifre sıfırlama bağlantısı gönder'}
              </button>
            </div>

            {forgotPasswordMutation.isError && (
              <div className="text-red-600 text-sm text-center">
                Şifre sıfırlama e-postası gönderilemedi. Lütfen tekrar deneyin.
              </div>
            )}

            <div className="text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <ArrowLeftIcon className="h-4 w-4" />
                Giriş sayfasına dön
              </Link>
            </div>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  )
}
