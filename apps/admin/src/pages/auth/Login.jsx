import { useState, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import { authAPI } from '../../lib/api.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import Footer from '../../components/Footer.jsx'
import i18n from '../../i18n.js'

function Countdown({ target, onExpired }) {
  const [remaining, setRemaining] = useState(() => Math.max(target - Date.now(), 0))

  useEffect(() => {
    if (remaining <= 0) {
      onExpired?.()
      return
    }

    const interval = setInterval(() => {
      setRemaining(Math.max(target - Date.now(), 0))
    }, 1000)

    return () => clearInterval(interval)
  }, [target, remaining, onExpired])

  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)

  return (
    <span>
      {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
    </span>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [emailNotVerified, setEmailNotVerified] = useState(null) // { email, message }
  const [resendingVerification, setResendingVerification] = useState(false)
  const [lockUntil, setLockUntil] = useState(() => {
    const stored = sessionStorage.getItem('login_lock_until')
    return stored ? parseInt(stored, 10) : null
  })
  const [lockReason, setLockReason] = useState(() => sessionStorage.getItem('login_lock_reason') || '')
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    // Set default language to Turkish if not set
    if (!localStorage.getItem('language')) {
      localStorage.setItem('language', 'tr')
      i18n.changeLanguage('tr')
    }
  }, [])

  useEffect(() => {
    // Check if there's a success message from navigation state
    if (location.state?.message) {
      setSuccessMessage(location.state.message)
      // Clear the message after 5 seconds
      const timer = setTimeout(() => setSuccessMessage(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [location.state])

  const isLocked = lockUntil && lockUntil > Date.now()

  useEffect(() => {
    if (lockUntil && lockUntil <= Date.now()) {
      setLockUntil(null)
      setLockReason('')
      sessionStorage.removeItem('login_lock_until')
      sessionStorage.removeItem('login_lock_reason')
    }
  }, [lockUntil])

  useEffect(() => {
    if (!lockUntil) return
    const now = Date.now()
    if (lockUntil <= now) {
      setLockUntil(null)
      setLockReason('')
      sessionStorage.removeItem('login_lock_until')
      sessionStorage.removeItem('login_lock_reason')
      return
    }
    const timeout = setTimeout(() => {
      setLockUntil(null)
      setLockReason('')
      sessionStorage.removeItem('login_lock_until')
      sessionStorage.removeItem('login_lock_reason')
    }, lockUntil - now)

    return () => clearTimeout(timeout)
  }, [lockUntil])

  const loginMutation = useMutation({
    mutationFn: () => authAPI.login(email, password),
    onSuccess: (response) => {
      setLockUntil(null)
      setLockReason('')
      sessionStorage.removeItem('login_lock_until')
      sessionStorage.removeItem('login_lock_reason')
      const data = response.data
      login(data)

      if (data.user?.mustChangePassword) {
        navigate('/profile?forcePasswordChange=1')
        return
      }

      if (data.requiresTenantSelection) {
        navigate('/select-tenant')
      } else {
        navigate('/')
      }
    },
    onError: (error) => {
      const errorCode = error.response?.data?.error
      const retryAfter = error.response?.data?.retryAfterSeconds
      const blocked = error.response?.data?.blocked
      const message = error.response?.data?.message || error.message
      const errorEmail = error.response?.data?.email

      // E-posta doğrulanmamış hatası
      if (errorCode === 'EMAIL_NOT_VERIFIED') {
        setEmailNotVerified({ email: errorEmail || email, message })
        return
      }

      // Diğer hatalar için temizle
      setEmailNotVerified(null)

      if (blocked && retryAfter) {
        const until = Date.now() + retryAfter * 1000
        const reasonText = message || 'Çok fazla hatalı deneme tespit edildi. Lütfen daha sonra tekrar deneyin.'
        setLockUntil(until)
        setLockReason(reasonText)
        sessionStorage.setItem('login_lock_until', String(until))
        sessionStorage.setItem('login_lock_reason', reasonText)
      }

      console.error('Login failed:', message)
    },
  })

  const handleResendVerification = async () => {
    if (!emailNotVerified?.email || resendingVerification) return

    setResendingVerification(true)
    try {
      await authAPI.resendVerification(emailNotVerified.email)
      setSuccessMessage('Doğrulama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.')
      setEmailNotVerified(null)
    } catch (err) {
      console.error('Resend verification failed:', err)
      // Hata olsa bile kullanıcıya mesaj göster
      setSuccessMessage('Doğrulama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.')
      setEmailNotVerified(null)
    } finally {
      setResendingVerification(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isLocked) return
    loginMutation.mutate()
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              ContextHub'a Giriş Yapın
            </h2>
          </div>

          {successMessage && (
            <div className="rounded-md bg-green-50 p-4">
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

          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                E-posta Adresi
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="E-posta adresi"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLocked}
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">
                Şifre
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Şifre"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLocked}
              />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 flex items-center pr-3 z-10"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-gray-500 hover:text-gray-700 transition-colors" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-gray-500 hover:text-gray-700 transition-colors" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm">
                <Link
                  to="/forgot-password"
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  Şifremi unuttum
                </Link>
              </div>
            </div>

            <div>
              {!isLocked ? (
                <button
                  type="submit"
                  disabled={loginMutation.isPending}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loginMutation.isPending ? 'Giriş yapılıyor...' : 'Giriş Yap'}
                </button>
              ) : (
                <div className="w-full py-3 px-4 text-center rounded-md bg-red-50 text-red-700 border border-red-200 text-sm">
                  {lockReason || 'Çok fazla hatalı deneme nedeniyle giriş geçici olarak devre dışı bırakıldı.'}
                  {lockUntil && lockUntil > Date.now() && (
                    <div className="mt-1 text-xs text-red-600">
                      Tekrar deneme süresi: <Countdown target={lockUntil} onExpired={() => {
                        setLockUntil(null)
                        setLockReason('')
                        sessionStorage.removeItem('login_lock_until')
                        sessionStorage.removeItem('login_lock_reason')
                      }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="text-center">
              <span className="text-sm text-gray-600">
                Hesabınız yok mu?{' '}
                <Link
                  to="/signup"
                  className="font-medium text-blue-600 hover:text-blue-500"
                >
                  Yeni Hesap Oluştur
                </Link>
              </span>
            </div>
            
            {emailNotVerified && (
              <div className="rounded-md bg-amber-50 border border-amber-200 p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <svg className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-800">E-posta Doğrulaması Gerekli</p>
                      <p className="text-sm text-amber-700 mt-1">{emailNotVerified.message}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resendingVerification}
                    className="w-full py-2 px-4 border border-amber-300 text-sm font-medium rounded-md text-amber-800 bg-amber-100 hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 transition-colors"
                  >
                    {resendingVerification ? 'Gönderiliyor...' : 'Doğrulama E-postasını Yeniden Gönder'}
                  </button>
                </div>
              </div>
            )}

            {loginMutation.isError && !emailNotVerified && (
              <div className="text-red-600 text-sm text-center">
                Giriş başarısız. Lütfen bilgilerinizi kontrol edin.
              </div>
            )}
          </form>
        </div>
      </div>
      <Footer />
    </div>
  )
}
