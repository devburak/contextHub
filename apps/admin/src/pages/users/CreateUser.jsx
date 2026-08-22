import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  EnvelopeIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { userAPI } from '../../lib/userAPI.js'
import { roleAPI } from '../../lib/roleAPI.js'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { useApiError } from '../../lib/useApiError.js'

const TOKENS = {
  '--invite-surface': '#f6f7f4',
  '--invite-panel': '#ffffff',
  '--invite-ink': '#17211b',
  '--invite-muted': '#647067',
  '--invite-border': '#d9ded8',
  '--invite-accent': '#145c3f',
  '--invite-accent-soft': '#e1eee7',
  '--invite-warning': '#9a4a18',
}

export default function CreateUser() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const toast = useToast()
  const describeError = useApiError()
  const { activeMembership, role: currentUserRole } = useAuth()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)

  const planSlug = String(
    activeMembership?.tenant?.currentPlan?.slug
      || activeMembership?.tenant?.plan
      || 'free'
  ).toLowerCase()
  const isFree = planSlug === 'free'

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  const rolesQuery = useQuery({
    queryKey: ['roles', 'invitation'],
    queryFn: roleAPI.getRoles,
    enabled: !isFree,
    retry: 1,
  })

  const availableRoles = useMemo(() => {
    const roles = Array.isArray(rolesQuery.data?.roles) ? rolesQuery.data.roles : []
    return roles
      .map((item) => ({
        id: item.id || item._id || item.key,
        key: item.key,
        name: item.name || item.key,
      }))
      .filter((item) => item.key && (item.key !== 'owner' || currentUserRole === 'owner'))
  }, [rolesQuery.data, currentUserRole])

  useEffect(() => {
    if (!role && availableRoles.length > 0) setRole(availableRoles[0].key)
  }, [availableRoles, role])

  const inviteMutation = useMutation({
    mutationFn: (payload) => userAPI.inviteUser(payload),
    onSuccess: () => {
      toast.success(t('user.invite_sent_generic'))
      queryClient.invalidateQueries({ queryKey: ['users'] })
      navigate('/users')
    },
    onError: (error) => toast.error(describeError(error, 'user.invite_error')),
  })

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!email.trim() || !role || isFree || !online) return
    inviteMutation.mutate({ email: email.trim().toLowerCase(), role })
  }

  return (
    <main style={TOKENS} className="min-h-[calc(100vh-4rem)] bg-[var(--invite-surface)] px-4 py-8 text-[var(--invite-ink)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Link to="/users" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--invite-muted)] hover:text-[var(--invite-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent)] focus:ring-offset-2">
          <ArrowLeftIcon className="h-4 w-4" />
          {t('user.back_to_users')}
        </Link>

        <header className="mt-8 border-b border-[var(--invite-border)] pb-6">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--invite-accent)]">{t('user.invite_eyebrow')}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('user.invite_title')}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--invite-muted)]">{t('user.invite_description')}</p>
        </header>

        {!online && (
          <div className="mt-6 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900" role="status">
            <ExclamationTriangleIcon className="h-5 w-5 flex-none" />
            {t('user.invite_offline')}
          </div>
        )}

        {isFree ? (
          <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--invite-border)] bg-[var(--invite-panel)] shadow-sm">
            <div className="border-l-4 border-[var(--invite-warning)] p-6 sm:p-8">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-[var(--invite-warning)]">
                <ShieldCheckIcon className="h-6 w-6" />
              </div>
              <h2 className="mt-5 text-xl font-semibold">{t('user.free_invites_disabled')}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--invite-muted)]">{t('user.free_invites_upgrade')}</p>
              <Link to="/billing" className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--invite-accent)] px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent)] focus:ring-offset-2">
                {t('user.view_plans')}
              </Link>
            </div>
          </section>
        ) : rolesQuery.isLoading ? (
          <section className="mt-6 space-y-4 rounded-2xl border border-[var(--invite-border)] bg-[var(--invite-panel)] p-6" aria-label={t('user.roles_loading')}>
            <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
            <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
            <div className="h-11 animate-pulse rounded-xl bg-gray-100" />
          </section>
        ) : rolesQuery.isError ? (
          <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
            <h2 className="font-semibold">{t('user.roles_load_error')}</h2>
            <button type="button" onClick={() => rolesQuery.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-red-500">
              <ArrowPathIcon className="h-4 w-4" /> {t('common.retry')}
            </button>
          </section>
        ) : availableRoles.length === 0 ? (
          <section className="mt-6 rounded-2xl border border-dashed border-[var(--invite-border)] bg-[var(--invite-panel)] p-8 text-center text-sm text-[var(--invite-muted)]">
            {t('user.roles_empty')}
          </section>
        ) : (
          <section className="mt-6 rounded-2xl border border-[var(--invite-border)] bg-[var(--invite-panel)] p-6 shadow-sm sm:p-8">
            <div className="flex gap-3 rounded-xl bg-[var(--invite-accent-soft)] p-4 text-sm text-[var(--invite-accent)]">
              <ShieldCheckIcon className="h-5 w-5 flex-none" />
              <p>{t('user.invite_privacy_notice')}</p>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div>
                <label htmlFor="invite-email" className="block text-sm font-semibold">{t('user.email')}</label>
                <div className="relative mt-2">
                  <EnvelopeIcon className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-[var(--invite-muted)]" />
                  <input id="invite-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required className="block w-full rounded-xl border border-[var(--invite-border)] py-2.5 pl-10 pr-3 text-sm focus:border-[var(--invite-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent-soft)]" placeholder={t('user.wizard.email_placeholder')} />
                </div>
              </div>

              <div>
                <label htmlFor="invite-role" className="block text-sm font-semibold">{t('user.wizard.role_label')}</label>
                <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value)} required className="mt-2 block w-full rounded-xl border border-[var(--invite-border)] px-3 py-2.5 text-sm focus:border-[var(--invite-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent-soft)]">
                  {availableRoles.map((item) => <option key={item.id} value={item.key}>{item.name}</option>)}
                </select>
              </div>

              {inviteMutation.isError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
                  {describeError(inviteMutation.error, 'user.invite_error')}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-[var(--invite-border)] pt-6 sm:flex-row sm:justify-end">
                <Link to="/users" className="inline-flex items-center justify-center rounded-xl border border-[var(--invite-border)] px-4 py-2.5 text-sm font-semibold">{t('user.cancel')}</Link>
                <button type="submit" disabled={!online || !email.trim() || !role || inviteMutation.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--invite-accent)] px-5 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                  {inviteMutation.isPending && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
                  {inviteMutation.isPending ? t('user.invite_sending') : t('user.wizard.invite_button')}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </main>
  )
}
