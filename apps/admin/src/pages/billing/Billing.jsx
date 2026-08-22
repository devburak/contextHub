import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  CreditCardIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { PERMISSIONS } from '../../constants/permissions.js'
import { createBillingCheckout, createBillingPortal, fetchBillingOverview, updateBillingProfile } from '../../lib/api/billing.js'
import CountryCombobox from '../../components/CountryCombobox.jsx'
import { activePlanStatus, checkoutButtonLabel, statusLabel } from './billingPresentation.js'
import { errorsFromBillingResponse, localizeBillingProfileErrors, validateBillingProfileForm } from './billingProfileValidation.js'

const TOKENS = {
  '--billing-canvas': '#f4f1ea',
  '--billing-surface': '#fffdf8',
  '--billing-ink': '#17211b',
  '--billing-muted': '#66736b',
  '--billing-line': '#d9d8cd',
  '--billing-accent': '#145c3f',
  '--billing-accent-soft': '#dcebe2',
  '--billing-warn': '#a04b18',
}

const INPUT_CLASS = 'mt-1 w-full rounded-xl border border-[var(--billing-line)] bg-white px-3 py-2.5 text-sm outline-none focus:border-[var(--billing-accent)] focus:ring-2 focus:ring-[var(--billing-accent-soft)] disabled:bg-gray-100'
const INVALID_INPUT_CLASS = 'border-red-500 focus:border-red-600 focus:ring-red-100'

function FieldMessage({ id, error, hint }) {
  if (!error && !hint) return null
  return <span id={id} className={`mt-1 block text-xs font-normal ${error ? 'text-red-700' : 'text-[var(--billing-muted)]'}`} role={error ? 'alert' : undefined}>{error || hint}</span>
}

function money(amountMinor, currency = 'USD', locale = 'tr-TR') {
  const showCents = Number(amountMinor || 0) % 100 !== 0
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: 2,
  })
    .format(Number(amountMinor || 0) / 100)
}

function date(value, locale = 'tr-TR') {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function intervalLabel(t, interval) {
  return t(interval === 'year' ? 'billing.interval.shortYear' : 'billing.interval.shortMonth')
}

function dateRange(start, end, locale = 'tr-TR') {
  if (!start && !end) return '—'
  return `${date(start, locale)} – ${date(end, locale)}`
}

function usageValue(key, value, locale = 'tr-TR') {
  if (key === 'storage') return `${(Number(value || 0) / (1024 ** 3)).toLocaleString(locale, { maximumFractionDigits: 2 })} GB`
  return Number(value || 0).toLocaleString(locale)
}

function LoadingState({ label }) {
  return (
    <div className="space-y-4" aria-label={label}>
      {[140, 260, 180].map((height) => <div key={height} className="animate-pulse rounded-2xl bg-white/70" style={{ height }} />)}
    </div>
  )
}

const EMPTY_PROFILE = {
  billingEmail: '',
  legalName: '',
  profileType: 'business',
  contactFirstName: '',
  contactLastName: '',
  phone: '',
  country: '',
  taxId: '',
  taxOffice: '',
  address: { line1: '', line2: '', city: '', district: '', region: '', postalCode: '' },
  declarationAccepted: false,
  serviceAgreementAccepted: false,
}

function HostedPaymentFrame({ content, onClose, t }) {
  if (!content) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={t('billing.securePayment.title')}>
      <div className="flex h-[min(760px,92vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div><p className="font-semibold">{t('billing.securePayment.title')}</p><p className="text-xs text-gray-500">{t('billing.securePayment.description')}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label={t('billing.securePayment.close')}><XMarkIcon className="h-5 w-5" /></button>
        </div>
        <iframe title={t('billing.securePayment.frameTitle')} srcDoc={content} sandbox="allow-forms allow-scripts allow-popups allow-top-navigation-by-user-activation" className="min-h-0 flex-1 border-0" />
      </div>
    </div>
  )
}

export default function Billing() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canView = hasPermission(PERMISSIONS.BILLING_VIEW)
  const canManage = hasPermission(PERMISSIONS.BILLING_MANAGE)
  const [interval, setInterval] = useState('month')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [fieldErrors, setFieldErrors] = useState({})
  const [hostedPaymentContent, setHostedPaymentContent] = useState('')
  const locale = i18n.resolvedLanguage === 'en' ? 'en-US' : 'tr-TR'
  const overview = useQuery({ queryKey: ['billing', 'overview'], queryFn: fetchBillingOverview, retry: 1, enabled: canView })

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const checkoutStatus = params.get('checkout')
    const paymentMethodStatus = params.get('payment_method')
    if (checkoutStatus === 'success') toast.success(t('billing.toast.checkoutSuccess'))
    if (checkoutStatus === 'failed') toast.error(t('billing.toast.checkoutFailed'))
    if (paymentMethodStatus === 'updated') toast.success(t('billing.toast.paymentMethodUpdated'))
    if (checkoutStatus || paymentMethodStatus) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [t, toast])

  useEffect(() => {
    const saved = overview.data?.billingAccount
    if (!saved) return
    setProfile({
      ...EMPTY_PROFILE,
      ...saved,
      taxId: '',
      address: { ...EMPTY_PROFILE.address, ...(saved.address || {}) },
      declarationAccepted: false,
      serviceAgreementAccepted: false,
    })
  }, [overview.data?.billingAccount])

  const checkout = useMutation({
    mutationFn: createBillingCheckout,
    onSuccess: (result) => {
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl)
      else if (result.checkoutContent) setHostedPaymentContent(result.checkoutContent)
      else toast.error(t('billing.error.checkoutLink'))
    },
    onError: (error) => toast.error(error.response?.data?.message || t('billing.error.checkoutStart')),
  })
  const portal = useMutation({
    mutationFn: createBillingPortal,
    onSuccess: (result) => {
      if (result.portalUrl) window.location.assign(result.portalUrl)
      else if (result.paymentMethodUrl) window.location.assign(result.paymentMethodUrl)
      else if (result.paymentMethodContent) setHostedPaymentContent(result.paymentMethodContent)
      else toast.error(t('billing.error.portalLink'))
    },
    onError: (error) => toast.error(error.response?.data?.message || t('billing.error.portalOpen')),
  })
  const saveProfile = useMutation({
    mutationFn: updateBillingProfile,
    onSuccess: async () => {
      setFieldErrors({})
      toast.success(t('billing.toast.profileSaved'))
      await overview.refetch()
    },
    onError: (error) => {
      const errors = errorsFromBillingResponse(t, error)
      if (Object.keys(errors).length > 0) setFieldErrors(errors)
      toast.error(error.response?.data?.error === 'InvalidBillingProfile' ? t('billing.validation.summary') : t('billing.error.profileSave'))
    },
  })

  const clearFieldError = (field) => setFieldErrors((current) => {
    if (!current[field]) return current
    const next = { ...current }
    delete next[field]
    return next
  })
  const updateProfileField = (field, value) => {
    clearFieldError(field)
    setProfile((current) => ({ ...current, [field]: value }))
  }
  const updateAddressField = (field, value) => {
    clearFieldError(`address.${field}`)
    setProfile((current) => ({ ...current, address: { ...current.address, [field]: value } }))
  }
  const fieldClass = (field) => `${INPUT_CLASS} ${fieldErrors[field] ? INVALID_INPUT_CLASS : ''}`
  const handleProfileSubmit = (event) => {
    event.preventDefault()
    const errors = localizeBillingProfileErrors(t, validateBillingProfileForm(profile, {
      hasStoredTaxId: overview.data?.billingAccount?.hasTaxId,
    }))
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      toast.error(t('billing.validation.summary'))
      document.querySelector('#billing-profile [aria-invalid="true"]')?.focus()
      return
    }
    saveProfile.mutate(profile)
  }

  const plans = useMemo(() => (overview.data?.plans || []).map((plan) => ({
    ...plan,
    selectedPrice: (plan.prices || []).find((price) => price.interval === interval) || null,
  })), [overview.data, interval])
  const usageEstimateByMetric = useMemo(() => Object.fromEntries(
    (overview.data?.charges?.usageEstimate?.lines || []).map((line) => [line.metric, line])
  ), [overview.data])

  if (!canView) {
    return <main style={TOKENS} className="min-h-[calc(100vh-4rem)] bg-[var(--billing-canvas)] p-8 text-[var(--billing-ink)]"><section className="mx-auto max-w-2xl rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--billing-warn)]">{t('billing.permission.eyebrow')}</p><h1 className="mt-2 text-2xl font-semibold">{t('billing.permission.title')}</h1><p className="mt-2 text-sm text-[var(--billing-muted)]">{t('billing.permission.description')}</p></section></main>
  }

  return (
    <main style={TOKENS} className="min-h-[calc(100vh-4rem)] bg-[var(--billing-canvas)] text-[var(--billing-ink)]">
      <HostedPaymentFrame content={hostedPaymentContent} onClose={() => setHostedPaymentContent('')} t={t} />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[var(--billing-line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--billing-accent)]">{t('billing.header.eyebrow')}</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{t('billing.header.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--billing-muted)]">{t('billing.header.description')}</p>
          </div>
          {overview.data?.billingAccount?.hasProviderCustomer && canManage && (
            <button type="button" onClick={() => portal.mutate()} disabled={!online || portal.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--billing-ink)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
              <CreditCardIcon className="h-5 w-5" /> {portal.isPending ? t('billing.portal.opening') : t('billing.portal.manage')}
            </button>
          )}
        </header>

        {!online && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><ExclamationTriangleIcon className="h-5 w-5" /> {t('billing.offline')}</div>
        )}

        {overview.isLoading ? <LoadingState label={t('billing.loading')} /> : overview.isError ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-semibold text-red-900">{t('billing.overview.errorTitle')}</h2>
            <p className="mt-1 text-sm text-red-700">{t('billing.overview.errorDescription')}</p>
            <button type="button" onClick={() => overview.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-900"><ArrowPathIcon className="h-4 w-4" /> {t('billing.action.retry')}</button>
          </section>
        ) : (
          <>
            <section className="grid overflow-hidden rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] lg:grid-cols-[1.4fr_1fr]">
              <div className="p-6 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">{t('billing.active.eyebrow')}</p>
                <div className="mt-3 flex flex-wrap items-baseline gap-3"><h2 className="text-4xl font-semibold">{overview.data.tenant.plan.name}</h2><span className="rounded-full bg-[var(--billing-accent-soft)] px-3 py-1 text-xs font-bold text-[var(--billing-accent)]">{activePlanStatus(t, overview.data.tenant.plan, overview.data.subscription)}</span></div>
                <p className="mt-5 text-sm text-[var(--billing-muted)]">{t('billing.active.accountLine', { tenant: overview.data.tenant.name, account: overview.data.account.name })}</p>
              </div>
              <div className="border-t border-[var(--billing-line)] bg-[var(--billing-accent)] p-6 text-white lg:border-l lg:border-t-0 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">{t(overview.data.tenant.plan.slug === 'enterprise' && !overview.data.subscription ? 'billing.period.contract' : 'billing.period.next')}</p>
                <p className="mt-3 text-2xl font-semibold">{overview.data.tenant.plan.slug === 'enterprise' && !overview.data.subscription ? t('billing.period.byContract') : date(overview.data.subscription?.currentPeriodEnd, locale)}</p>
                <p className="mt-2 text-sm text-white/75">{t(overview.data.tenant.plan.slug === 'enterprise' && !overview.data.subscription ? 'billing.period.contractDescription' : overview.data.subscription?.cancelAtPeriodEnd ? 'billing.period.canceling' : 'billing.period.renewal')}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-6 sm:p-8" aria-labelledby="billing-charge-summary">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">{t('billing.charges.eyebrow')}</p>
                  <h2 id="billing-charge-summary" className="mt-1 text-2xl font-semibold">{t('billing.charges.title')}</h2>
                </div>
                <p className="max-w-xl text-sm text-[var(--billing-muted)]">{t('billing.charges.description')}</p>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <article className="rounded-xl border border-[var(--billing-line)] bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--billing-muted)]">{t(overview.data.charges.subscription.isEstimated ? 'billing.charges.listPrice' : 'billing.charges.activePrice')}</p>
                  <p className="mt-3 text-3xl font-semibold">{money(overview.data.charges.subscription.amountMinor, overview.data.charges.subscription.currency, locale)}</p>
                  <p className="mt-1 text-sm text-[var(--billing-muted)]">{t('billing.charges.perTenant', { interval: intervalLabel(t, overview.data.charges.subscription.interval) })}</p>
                  <p className="mt-4 text-xs leading-5 text-[var(--billing-muted)]">{overview.data.charges.subscription.isEstimated ? t('billing.charges.catalogNote') : dateRange(overview.data.charges.subscription.currentPeriodStart, overview.data.charges.subscription.currentPeriodEnd, locale)}</p>
                </article>

                <article className="rounded-xl border border-[var(--billing-line)] bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--billing-muted)]">{t('billing.charges.usageTitle')}</p>
                  {overview.data.charges.usageEstimate.available ? (
                    <>
                      <p className="mt-3 text-3xl font-semibold">{money(overview.data.charges.usageEstimate.amountMinor, overview.data.charges.usageEstimate.currency, locale)}</p>
                      <p className="mt-1 text-sm text-[var(--billing-muted)]">{t('billing.charges.usageSubtitle')}</p>
                      <p className="mt-4 text-xs leading-5 text-[var(--billing-muted)]">{t('billing.charges.usageNote')}</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-2xl font-semibold">{t('billing.charges.included')}</p>
                      <p className="mt-1 text-sm text-[var(--billing-muted)]">{t('billing.charges.includedNote')}</p>
                    </>
                  )}
                </article>

                <article className="rounded-xl border border-[var(--billing-line)] bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--billing-muted)]">{t('billing.charges.latestInvoice')}</p>
                  {overview.data.charges.latestInvoice ? (
                    <>
                      <p className="mt-3 text-3xl font-semibold">{money(overview.data.charges.latestInvoice.totalMinor, overview.data.charges.latestInvoice.currency, locale)}</p>
                      <p className="mt-1 text-sm text-[var(--billing-muted)]">{statusLabel(t, overview.data.charges.latestInvoice.status)} · {date(overview.data.charges.latestInvoice.billedAt, locale)}</p>
                      <p className="mt-4 text-xs text-[var(--billing-muted)]">{overview.data.charges.latestInvoice.number || overview.data.charges.latestInvoice.id.slice(-8)}</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-2xl font-semibold">{t('billing.charges.noInvoice')}</p>
                      <p className="mt-1 text-sm text-[var(--billing-muted)]">{t('billing.charges.noInvoiceNote')}</p>
                    </>
                  )}
                </article>
              </div>
            </section>

            {(overview.data.quotaAlerts || []).length > 0 && (
              <section className="rounded-2xl border border-orange-200 bg-orange-50 p-6">
                <h2 className="font-semibold text-orange-950">{t('billing.quotaAlerts.title')}</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {overview.data.quotaAlerts.slice(0, 6).map((alert) => <div key={alert.id} className="rounded-xl bg-white p-4 text-sm"><strong>%{alert.threshold}</strong> · {t(`billing.usage.${alert.metric}`, { defaultValue: alert.metric })}<p className="mt-1 text-gray-600">{alert.usage.toLocaleString(locale)} / {alert.limit.toLocaleString(locale)}</p></div>)}
                </div>
              </section>
            )}

            <section>
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">{t('billing.usage.eyebrow')}</p><h2 className="mt-1 text-2xl font-semibold">{t('billing.usage.title')}</h2></div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(overview.data.usage || {}).map(([key, item]) => {
                  const estimate = usageEstimateByMetric[key]
                  return <article key={key} className="rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-5">
                    <div className="flex items-center justify-between"><p className="text-sm font-semibold capitalize">{t(`billing.usage.${key}`, { defaultValue: key })}</p><span className="text-xs font-bold text-[var(--billing-muted)]">{item.unlimited ? t('billing.usage.unlimited') : `%${item.percentage}`}</span></div>
                    <p className="mt-3 text-2xl font-semibold">{usageValue(key, item.usage, locale)}</p>
                    <p className="mt-1 text-xs text-[var(--billing-muted)]">/ {item.unlimited ? t('billing.usage.unlimited').toLocaleLowerCase(locale) : usageValue(key, item.limit, locale)}</p>
                    {!item.unlimited && <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-[var(--billing-accent)]" style={{ width: `${item.percentage}%` }} /></div>}
                    {estimate && (
                      <div className="mt-4 border-t border-[var(--billing-line)] pt-4">
                        <div className="flex items-center justify-between gap-3 text-xs"><span className="text-[var(--billing-muted)]">{t('billing.usage.informational')}</span><strong>{money(estimate.amountMinor, overview.data.charges.usageEstimate.currency, locale)}</strong></div>
                        <p className="mt-1 text-[11px] text-[var(--billing-muted)]">{t(estimate.unit === 'gb-month' ? 'billing.usage.gbMonth' : 'billing.usage.thousandRequests', { price: money(estimate.unitPriceMinor, overview.data.charges.usageEstimate.currency, locale) })}</p>
                      </div>
                    )}
                  </article>
                })}
              </div>
            </section>

            <section className="grid overflow-hidden rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] lg:grid-cols-[1.6fr_0.8fr]" aria-labelledby="billing-profile-title">
              <form id="billing-profile" className="p-6 sm:p-8" onSubmit={handleProfileSubmit} noValidate>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">{t('billing.profile.eyebrow')}</p><h2 id="billing-profile-title" className="mt-1 text-2xl font-semibold">{t('billing.profile.title')}</h2></div>
                  <div className="flex flex-wrap gap-2">
                    {overview.data.billingAccount?.profileComplete && <span className="w-fit rounded-full bg-[var(--billing-accent-soft)] px-3 py-1 text-xs font-bold text-[var(--billing-accent)]">{t('billing.profile.complete')}</span>}
                    {overview.data.billingAccount?.commercialReadiness?.agreementAccepted && <span className="w-fit rounded-full border border-[var(--billing-accent)]/20 bg-white px-3 py-1 text-xs font-bold text-[var(--billing-accent)]">{t('billing.profile.agreementRecorded')}</span>}
                    {overview.data.billingAccount?.commercialReadiness?.paymentVerified && <span className="w-fit rounded-full border border-[var(--billing-accent)]/20 bg-white px-3 py-1 text-xs font-bold text-[var(--billing-accent)]">{t('billing.profile.paymentVerified')}</span>}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[var(--billing-muted)]">{t('billing.profile.description')}</p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">{t('billing.profile.type')}<select className={fieldClass('profileType')} value={profile.profileType} onChange={(event) => updateProfileField('profileType', event.target.value)} disabled={!canManage} aria-invalid={Boolean(fieldErrors.profileType)}><option value="business">{t('billing.profile.business')}</option><option value="individual">{t('billing.profile.individual')}</option></select><FieldMessage error={fieldErrors.profileType} /></label>
                  <CountryCombobox value={profile.country} onChange={(country) => updateProfileField('country', country)} disabled={!canManage || overview.data.paymentRouting?.jurisdictionLocked} required error={fieldErrors.country} />
                  <label className="text-sm font-medium sm:col-span-2">{t('billing.profile.legalName')}<input className={fieldClass('legalName')} value={profile.legalName} onChange={(event) => updateProfileField('legalName', event.target.value)} minLength={2} maxLength={200} autoComplete="organization" disabled={!canManage} aria-invalid={Boolean(fieldErrors.legalName)} /><FieldMessage error={fieldErrors.legalName} /></label>
                  <label className="text-sm font-medium">{t('billing.profile.firstName')}<input className={fieldClass('contactFirstName')} value={profile.contactFirstName} onChange={(event) => updateProfileField('contactFirstName', event.target.value)} maxLength={100} autoComplete="given-name" disabled={!canManage} aria-invalid={Boolean(fieldErrors.contactFirstName)} /><FieldMessage error={fieldErrors.contactFirstName} /></label>
                  <label className="text-sm font-medium">{t('billing.profile.lastName')}<input className={fieldClass('contactLastName')} value={profile.contactLastName} onChange={(event) => updateProfileField('contactLastName', event.target.value)} maxLength={100} autoComplete="family-name" disabled={!canManage} aria-invalid={Boolean(fieldErrors.contactLastName)} /><FieldMessage error={fieldErrors.contactLastName} /></label>
                  <label className="text-sm font-medium">{t('billing.profile.email')}<input className={fieldClass('billingEmail')} type="email" value={profile.billingEmail} onChange={(event) => updateProfileField('billingEmail', event.target.value)} maxLength={254} autoComplete="email" disabled={!canManage} aria-invalid={Boolean(fieldErrors.billingEmail)} aria-describedby="billing-email-message" /><FieldMessage id="billing-email-message" error={fieldErrors.billingEmail} /></label>
                  <label className="text-sm font-medium">{t('billing.profile.phone')}<input className={fieldClass('phone')} type="tel" value={profile.phone} onChange={(event) => updateProfileField('phone', event.target.value)} maxLength={30} placeholder={profile.country === 'TR' ? '+90 555 111 22 33' : '+1 415 555 0100'} autoComplete="tel" disabled={!canManage} aria-invalid={Boolean(fieldErrors.phone)} aria-describedby="billing-phone-message" /><FieldMessage id="billing-phone-message" error={fieldErrors.phone} hint={t(profile.country === 'TR' ? 'billing.profile.phoneHintTR' : 'billing.profile.phoneHintInternational')} /></label>
                  <label className="text-sm font-medium">{t(profile.profileType === 'business' ? 'billing.profile.businessTaxId' : 'billing.profile.individualTaxId')}<input className={fieldClass('taxId')} inputMode="numeric" value={profile.taxId} onChange={(event) => updateProfileField('taxId', event.target.value)} maxLength={11} placeholder={overview.data.billingAccount?.taxIdMasked || ''} disabled={!canManage} aria-invalid={Boolean(fieldErrors.taxId)} aria-describedby="billing-tax-message" /><FieldMessage id="billing-tax-message" error={fieldErrors.taxId} hint={t('billing.profile.taxIdHint')} /></label>
                  {profile.profileType === 'business' && <label className="text-sm font-medium">{t('billing.profile.taxOffice')}<input className={fieldClass('taxOffice')} value={profile.taxOffice} onChange={(event) => updateProfileField('taxOffice', event.target.value)} maxLength={120} disabled={!canManage} aria-invalid={Boolean(fieldErrors.taxOffice)} /><FieldMessage error={fieldErrors.taxOffice} /></label>}
                  <label className="text-sm font-medium sm:col-span-2">{t('billing.profile.address1')}<input className={fieldClass('address.line1')} value={profile.address.line1} onChange={(event) => updateAddressField('line1', event.target.value)} minLength={3} maxLength={250} autoComplete="address-line1" disabled={!canManage} aria-invalid={Boolean(fieldErrors['address.line1'])} /><FieldMessage error={fieldErrors['address.line1']} /></label>
                  <label className="text-sm font-medium sm:col-span-2">{t('billing.profile.address2')}<input className={INPUT_CLASS} value={profile.address.line2} onChange={(event) => updateAddressField('line2', event.target.value)} maxLength={250} disabled={!canManage} /></label>
                  <label className="text-sm font-medium">{t('billing.profile.city')}<input className={fieldClass('address.city')} value={profile.address.city} onChange={(event) => updateAddressField('city', event.target.value)} maxLength={100} autoComplete="address-level2" disabled={!canManage} aria-invalid={Boolean(fieldErrors['address.city'])} /><FieldMessage error={fieldErrors['address.city']} /></label>
                  <label className="text-sm font-medium">{t('billing.profile.district')}<input className={INPUT_CLASS} value={profile.address.district} onChange={(event) => updateAddressField('district', event.target.value)} maxLength={100} disabled={!canManage} /></label>
                  <label className="text-sm font-medium">{t('billing.profile.region')}<input className={INPUT_CLASS} value={profile.address.region} onChange={(event) => updateAddressField('region', event.target.value)} maxLength={100} disabled={!canManage} /></label>
                  <label className="text-sm font-medium">{t('billing.profile.postalCode')}<input className={fieldClass('address.postalCode')} value={profile.address.postalCode} onChange={(event) => updateAddressField('postalCode', event.target.value)} minLength={2} maxLength={12} inputMode={profile.country === 'TR' ? 'numeric' : 'text'} autoComplete="postal-code" disabled={!canManage} aria-invalid={Boolean(fieldErrors['address.postalCode'])} aria-describedby="billing-postal-message" /><FieldMessage id="billing-postal-message" error={fieldErrors['address.postalCode']} hint={t(profile.country === 'TR' ? 'billing.profile.postalCodeHintTR' : 'billing.profile.postalCodeHintInternational')} /></label>
                </div>

                <section className="mt-6 rounded-2xl border border-[var(--billing-line)] bg-[#f7f6f0] p-5" aria-labelledby="billing-legal-title">
                  <div className="flex gap-3">
                    <DocumentTextIcon className="mt-0.5 h-6 w-6 shrink-0 text-[var(--billing-accent)]" />
                    <div>
                      <h3 id="billing-legal-title" className="font-semibold">{t('billing.legal.title')}</h3>
                      <p className="mt-1 text-xs leading-5 text-[var(--billing-muted)]">{t('billing.legal.description')}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <details id="billing-terms" className="rounded-xl border border-[var(--billing-line)] bg-white p-4 open:shadow-sm">
                      <summary className="cursor-pointer font-semibold text-sm text-[var(--billing-ink)]"><span className="ml-2">{t('billing.legal.termsTitle')}</span><span className="mt-1 block pl-5 text-xs font-normal text-[var(--billing-muted)]">{t('billing.legal.termsSummary')}</span></summary>
                      <ul className="mt-4 space-y-2 border-t border-[var(--billing-line)] pt-4 text-xs leading-5 text-[var(--billing-muted)]">
                        {['termsScope', 'termsBilling', 'termsQuota', 'termsInfrastructure', 'termsCancellation', 'termsSecurity'].map((key) => <li key={key} className="flex gap-2"><span aria-hidden="true">•</span><span>{t(`billing.legal.${key}`)}</span></li>)}
                      </ul>
                    </details>
                    <details id="billing-privacy" className="rounded-xl border border-[var(--billing-line)] bg-white p-4 open:shadow-sm">
                      <summary className="cursor-pointer font-semibold text-sm text-[var(--billing-ink)]"><span className="ml-2">{t('billing.legal.privacyTitle')}</span><span className="mt-1 block pl-5 text-xs font-normal text-[var(--billing-muted)]">{t('billing.legal.privacySummary')}</span></summary>
                      <div className="mt-4 space-y-2 border-t border-[var(--billing-line)] pt-4 text-xs leading-5 text-[var(--billing-muted)]">
                        {['privacyController', 'privacyPurpose', 'privacyRecipients', 'privacyInternationalTransfer', 'privacyBasis', 'privacyRights'].map((key) => <p key={key}>{t(`billing.legal.${key}`)}</p>)}
                      </div>
                    </details>
                  </div>
                  <p className="mt-3 text-[11px] text-[var(--billing-muted)]">{t('billing.legal.version', { version: overview.data.paymentRouting?.requiredServiceAgreementVersion })}</p>
                </section>

                {canManage && <label className={`mt-4 flex items-start gap-3 rounded-xl bg-[var(--billing-accent-soft)] p-4 text-sm ${fieldErrors.declarationAccepted ? 'ring-1 ring-red-500' : ''}`}><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--billing-accent)]" checked={profile.declarationAccepted} onChange={(event) => updateProfileField('declarationAccepted', event.target.checked)} aria-invalid={Boolean(fieldErrors.declarationAccepted)} /><span>{t('billing.profile.declaration')}<FieldMessage error={fieldErrors.declarationAccepted} /></span></label>}
                {canManage && <label className={`mt-3 flex items-start gap-3 rounded-xl border bg-white p-4 text-sm ${fieldErrors.serviceAgreementAccepted ? 'border-red-500' : 'border-[var(--billing-line)]'}`}><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--billing-accent)]" checked={profile.serviceAgreementAccepted} onChange={(event) => updateProfileField('serviceAgreementAccepted', event.target.checked)} aria-invalid={Boolean(fieldErrors.serviceAgreementAccepted)} /><span>{t('billing.profile.agreement')} <a href="#billing-terms" className="font-semibold text-[var(--billing-accent)] underline underline-offset-2">{t('billing.legal.openTerms')}</a> · <a href="#billing-privacy" className="font-semibold text-[var(--billing-accent)] underline underline-offset-2">{t('billing.legal.openPrivacy')}</a><FieldMessage error={fieldErrors.serviceAgreementAccepted} /></span></label>}
                {overview.data.paymentRouting?.jurisdictionLocked && <p className="mt-3 text-xs text-[var(--billing-warn)]">{t('billing.profile.countryLocked')}</p>}
                {canManage && <button type="submit" disabled={!online || saveProfile.isPending} className="mt-5 rounded-xl bg-[var(--billing-ink)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{saveProfile.isPending ? t('billing.profile.saving') : t('billing.profile.save')}</button>}
              </form>

              <aside className="border-t border-[var(--billing-line)] bg-[#eef2ec] p-6 lg:border-l lg:border-t-0 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">{t('billing.paymentMethods.title')}</p>
                <div className="mt-4 space-y-3">
                  {(overview.data.paymentRouting?.paymentMethods || []).map((method) => <div key={method.key} className="rounded-xl border border-white/80 bg-white p-4"><div className="flex items-center gap-2 font-semibold"><CreditCardIcon className="h-5 w-5 text-[var(--billing-accent)]" />{t(`billing.paymentMethod.${method.key}.label`, { defaultValue: method.label })}</div><p className="mt-2 text-xs leading-5 text-[var(--billing-muted)]">{t(`billing.paymentMethod.${method.key}.description`, { defaultValue: method.description })}</p></div>)}
                </div>
                {!overview.data.paymentRouting?.profileComplete && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{t('billing.paymentMethods.profileRequired')}</div>}
                {overview.data.paymentRouting?.profileComplete && !overview.data.paymentRouting?.checkoutAvailable && <div className="mt-4 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">{t('billing.paymentMethods.unavailable')}</div>}
                <p className="mt-5 text-xs leading-5 text-[var(--billing-muted)]">{t('billing.paymentMethods.security')}</p>
              </aside>
            </section>

            <section>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">{t('billing.plans.eyebrow')}</p><h2 className="mt-1 text-2xl font-semibold">{t('billing.plans.title')}</h2></div>
                <div className="inline-flex rounded-xl border border-[var(--billing-line)] bg-white p-1" aria-label={t('billing.plans.intervalLabel')}>
                  {['month', 'year'].map((key) => <button key={key} type="button" onClick={() => setInterval(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${interval === key ? 'bg-[var(--billing-ink)] text-white' : 'text-[var(--billing-muted)]'}`}>{t(`billing.interval.${key}`)}</button>)}
                </div>
              </div>
              {plans.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-[var(--billing-line)] p-8 text-center text-sm text-[var(--billing-muted)]">{t('billing.plans.empty')}</div> : (
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {plans.map((plan) => {
                    const price = plan.selectedPrice
                    const enterprise = plan.pricingMode === 'contract'
                    const current = overview.data.tenant.plan.slug === plan.slug
                    const hasSubscription = Boolean(overview.data.subscription && ['active', 'trialing', 'past_due', 'paused'].includes(overview.data.subscription.status))
                    const checkoutAvailable = Boolean(overview.data.paymentRouting?.checkoutAvailable)
                    const canCheckout = !enterprise && !current && !hasSubscription && canManage && online && checkoutAvailable && price?.checkoutReady && price?.id
                    const canOpenProfile = !enterprise && !current && !hasSubscription && canManage && online && !overview.data.paymentRouting?.profileComplete
                    const buttonLabel = checkoutButtonLabel(t, { current, enterprise, checkoutAvailable, checkoutReady: price?.checkoutReady, hasProfile: overview.data.paymentRouting?.profileComplete, hasSubscription })
                    return <article key={plan.id} className={`flex flex-col rounded-2xl border bg-[var(--billing-surface)] p-6 shadow-sm ${current ? 'border-[var(--billing-accent)] ring-2 ring-[var(--billing-accent-soft)]' : 'border-[var(--billing-line)]'}`}>
                      <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--billing-accent)]">{t(`billing.plan.${plan.slug}.badge`, { defaultValue: plan.marketing?.badge || plan.name })}</p>{current && <span className="rounded-full bg-[var(--billing-accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--billing-accent)]">{t('billing.plans.active')}</span>}</div>
                      <h3 className="mt-2 text-2xl font-semibold">{plan.name}</h3>
                      <p className="mt-1 min-h-10 text-sm text-[var(--billing-muted)]">{t(`billing.plan.${plan.slug}.tagline`, { defaultValue: plan.marketing?.tagline || plan.description })}</p>
                      {enterprise ? <div className="mt-5"><p className="text-3xl font-semibold">{t('billing.plans.contractPrice')}</p><p className="mt-1 text-xs text-[var(--billing-muted)]">{t('billing.plans.contractNote')}</p></div> : price ? <div className="mt-5"><p className="text-3xl font-semibold">{money(price.amountMinor, price.currency, locale)} <span className="text-sm font-normal text-[var(--billing-muted)]">{t('billing.plans.priceUnit', { interval: intervalLabel(t, interval) })}</span></p>{price.catalogOnly && <p className="mt-1 text-xs text-[var(--billing-muted)]">{t('billing.plans.catalogOnly')}</p>}</div> : <div className="mt-5"><p className="text-2xl font-semibold">{t('billing.plans.pricePending')}</p><p className="mt-1 text-xs text-[var(--billing-muted)]">{t('billing.plans.pricePendingNote')}</p></div>}
                      <ul className="mt-5 flex-1 space-y-2 text-sm">{(plan.capabilities || []).slice(0, 4).map((capability) => <li key={capability.key} className="flex gap-2"><CheckIcon className="h-5 w-5 shrink-0 text-[var(--billing-accent)]" /> {t(`billing.capability.${capability.key}${['capacity', 'support'].includes(capability.key) ? `.${plan.slug}` : ''}`, { defaultValue: capability.label })}</li>)}</ul>
                      {current ? <button type="button" disabled className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--billing-accent)] px-4 py-3 text-sm font-semibold text-white opacity-50">{buttonLabel}</button> : enterprise ? <a href="mailto:support@contexthub.com?subject=ContextHub%20Enterprise%20teklifi" className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--billing-accent)] px-4 py-3 text-sm font-semibold text-[var(--billing-accent)]">{buttonLabel} <ArrowTopRightOnSquareIcon className="h-4 w-4" /></a> : <button type="button" disabled={(!canCheckout && !canOpenProfile) || checkout.isPending} onClick={() => canCheckout ? checkout.mutate(price.id) : document.getElementById('billing-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--billing-accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{buttonLabel} {canCheckout && <ArrowTopRightOnSquareIcon className="h-4 w-4" />}</button>}
                    </article>
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-6">
              <h2 className="text-xl font-semibold">{t('billing.invoices.title')}</h2>
              {(overview.data.invoices || []).length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-[var(--billing-line)] p-8 text-center text-sm text-[var(--billing-muted)]">{t('billing.invoices.empty')}</div> : (
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-[var(--billing-muted)]"><tr><th className="py-3">{t('billing.invoices.invoice')}</th><th>{t('billing.invoices.period')}</th><th>{t('billing.invoices.status')}</th><th>{t('billing.invoices.subtotal')}</th><th>{t('billing.invoices.tax')}</th><th>{t('billing.invoices.total')}</th><th className="text-right">{t('billing.invoices.document')}</th></tr></thead><tbody>{overview.data.invoices.map((invoice) => <tr key={invoice.id} className="border-t border-[var(--billing-line)]"><td className="py-4 font-medium">{invoice.number || invoice.id.slice(-8)}<span className="mt-1 block text-xs font-normal text-[var(--billing-muted)]">{date(invoice.billedAt, locale)}</span></td><td>{dateRange(invoice.periodStart, invoice.periodEnd, locale)}</td><td>{statusLabel(t, invoice.status)}</td><td>{money(invoice.subtotalMinor, invoice.currency, locale)}</td><td>{money(invoice.taxMinor, invoice.currency, locale)}</td><td className="font-semibold">{money(invoice.totalMinor, invoice.currency, locale)}</td><td className="text-right">{invoice.documentUrl ? <a className="font-semibold text-[var(--billing-accent)]" href={invoice.documentUrl} target="_blank" rel="noreferrer">{t('billing.invoices.open')}</a> : '—'}</td></tr>)}</tbody></table></div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
