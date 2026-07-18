import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { authAPI } from '../../lib/api.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import Footer from '../../components/Footer.jsx'

export default function AcceptInvite() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const token = searchParams.get('token') || ''

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState('')

  const previewQuery = useQuery({
    queryKey: ['invitation-preview', token],
    queryFn: async () => {
      const { data } = await authAPI.previewInvitation(token)
      return data
    },
    enabled: Boolean(token),
    retry: false,
  })

  useEffect(() => {
    if (!previewQuery.data) {
      return
    }

    setFirstName((current) => current || previewQuery.data.firstName || '')
    setLastName((current) => current || previewQuery.data.lastName || '')
  }, [previewQuery.data])

  const expiresAt = useMemo(() => {
    const value = previewQuery.data?.expiresAt
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return null
    return date.toLocaleString('tr-TR')
  }, [previewQuery.data?.expiresAt])

  const acceptMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await authAPI.acceptInvitation(payload)
      return data
    },
    onSuccess: (data) => {
      const activeMembership = data.activeMembership || data.membership

      login({
        user: data.user,
        memberships: data.memberships?.length ? data.memberships : [activeMembership],
        activeMembership,
        requiresTenantSelection: false,
        csrfToken: data.csrfToken,
      })

      navigate('/', {
        replace: true,
        state: { message: 'Davet kabul edildi.' },
      })
    },
    onError: (error) => {
      const message = error.response?.data?.message || 'Davet kabul edilemedi.'
      setFormError(message)
    },
  })

  const handleSubmit = (event) => {
    event.preventDefault()
    setFormError('')

    if (!token) {
      setFormError('Davet bağlantısı eksik.')
      return
    }

    if (previewQuery.data?.requiresPasswordSetup) {
      if (password.length < 6) {
        setFormError('Şifre en az 6 karakter olmalıdır.')
        return
      }

      if (password !== confirmPassword) {
        setFormError('Şifreler eşleşmiyor.')
        return
      }
    }

    acceptMutation.mutate({
      token,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      password: previewQuery.data?.requiresPasswordSetup ? password : undefined,
    })
  }

  const shellClass = 'min-h-screen flex flex-col bg-[var(--surface)] text-[var(--ink)] [--surface:#f7f8fb] [--surface-2:#ffffff] [--ink:#101827] [--muted:#5c667a] [--border:#d9dee8] [--accent:#1d4ed8] [--accent-soft:#dbeafe] [--success:#047857] [--danger:#b91c1c]'

  if (!token) {
    return (
      <div className={shellClass}>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <StatusPanel
            tone="danger"
            title="Geçersiz Davet Bağlantısı"
            message="Davet bağlantısı token bilgisi içermiyor."
            action={<LoginLink />}
          />
        </main>
        <Footer />
      </div>
    )
  }

  if (previewQuery.isLoading) {
    return (
      <div className={shellClass}>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-lg rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-8 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
                <ArrowPathIcon className="h-6 w-6 animate-spin" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="h-5 w-44 rounded bg-gray-200" />
                <div className="mt-3 h-4 w-64 max-w-full rounded bg-gray-100" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    )
  }

  if (previewQuery.isError) {
    const message = previewQuery.error?.response?.data?.message || 'Davet bağlantısı geçersiz veya süresi dolmuş.'
    return (
      <div className={shellClass}>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <StatusPanel
            tone="danger"
            title="Davet Açılamadı"
            message={message}
            action={
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={() => previewQuery.refetch()}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
                >
                  <ArrowPathIcon className="h-4 w-4" />
                  Tekrar Dene
                </button>
                <LoginLink />
              </div>
            }
          />
        </main>
        <Footer />
      </div>
    )
  }

  if (acceptMutation.isSuccess) {
    return (
      <div className={shellClass}>
        <main className="flex flex-1 items-center justify-center px-4 py-12">
          <StatusPanel
            tone="success"
            title="Davet Kabul Edildi"
            message="Varlık oturumunuz hazırlanıyor."
          />
        </main>
        <Footer />
      </div>
    )
  }

  const preview = previewQuery.data

  return (
    <div className={shellClass}>
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
          <section className="border-b border-[var(--border)] bg-slate-950 p-8 text-white lg:border-b-0 lg:border-r">
            <div className="flex h-full flex-col justify-between gap-12">
              <div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15">
                  <BuildingOffice2Icon className="h-6 w-6" />
                </div>
                <h1 className="mt-8 text-3xl font-bold tracking-normal">
                  {preview?.tenant?.name || 'ContextHub'} daveti
                </h1>
                <p className="mt-4 text-sm leading-6 text-slate-300">
                  Bu davet kabul edildiğinde oturumunuz ilgili varlık ve rol ile açılır.
                </p>
              </div>

              <dl className="space-y-4 text-sm">
                <InfoRow label="Varlık" value={preview?.tenant?.name || '-'} />
                <InfoRow label="E-posta" value={preview?.email || '-'} />
                <InfoRow label="Rol" value={preview?.role || '-'} />
                {expiresAt && <InfoRow label="Son kullanım" value={expiresAt} />}
              </dl>
            </div>
          </section>

          <section className="p-6 sm:p-8">
            <div className="mb-6 inline-flex items-center gap-2 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-[var(--accent)]">
              <ShieldCheckIcon className="h-4 w-4" />
              Tenant kapsamlı erişim
            </div>

            <h2 className="text-2xl font-bold text-[var(--ink)]">Daveti kabul et</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Bilgilerinizi onaylayın. Kabul sonrası aktif tenant otomatik olarak bu varlık olacak.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                    Ad
                  </label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    className="mt-1 block w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-blue-100"
                    autoComplete="given-name"
                  />
                </div>
                <div>
                  <label htmlFor="lastName" className="block text-sm font-medium text-gray-700">
                    Soyad
                  </label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    className="mt-1 block w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm shadow-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-blue-100"
                    autoComplete="family-name"
                  />
                </div>
              </div>

              {preview?.requiresPasswordSetup && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex gap-3">
                    <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-amber-900">Hesap şifresi gerekli</p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <div>
                          <label htmlFor="password" className="block text-sm font-medium text-amber-950">
                            Şifre
                          </label>
                          <input
                            id="password"
                            name="password"
                            type="password"
                            minLength={6}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="mt-1 block w-full rounded-md border border-amber-200 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
                            autoComplete="new-password"
                            required
                          />
                        </div>
                        <div>
                          <label htmlFor="confirmPassword" className="block text-sm font-medium text-amber-950">
                            Şifre tekrar
                          </label>
                          <input
                            id="confirmPassword"
                            name="confirmPassword"
                            type="password"
                            minLength={6}
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            className="mt-1 block w-full rounded-md border border-amber-200 px-3 py-2 text-sm shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
                            autoComplete="new-password"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {formError && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
                >
                  <ArrowLeftIcon className="h-4 w-4" />
                  Girişe dön
                </Link>
                <button
                  type="submit"
                  disabled={acceptMutation.isPending}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {acceptMutation.isPending ? (
                    <>
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      Kabul ediliyor
                    </>
                  ) : (
                    'Daveti Kabul Et'
                  )}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-md bg-white/5 p-3 ring-1 ring-white/10">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 truncate font-medium text-white">{value}</dd>
    </div>
  )
}

function StatusPanel({ tone, title, message, action }) {
  const isSuccess = tone === 'success'
  const Icon = isSuccess ? CheckCircleIcon : ExclamationTriangleIcon
  const iconClass = isSuccess ? 'bg-green-50 text-[var(--success)]' : 'bg-red-50 text-[var(--danger)]'

  return (
    <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-8 text-center shadow-sm">
      <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-lg ${iconClass}`}>
        <Icon className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-2xl font-bold text-[var(--ink)]">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

function LoginLink() {
  return (
    <Link
      to="/login"
      className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      Girişe Dön
    </Link>
  )
}
