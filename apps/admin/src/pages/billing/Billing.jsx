import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { PERMISSIONS } from '../../constants/permissions.js'
import { createBillingCheckout, createBillingPortal, fetchBillingOverview, updateBillingProfile } from '../../lib/api/billing.js'
import CountryCombobox from '../../components/CountryCombobox.jsx'
import { activePlanStatus, checkoutButtonLabel, statusLabel } from './billingPresentation.js'

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

function money(amountMinor, currency = 'USD') {
  const showCents = Number(amountMinor || 0) % 100 !== 0
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: 2,
  })
    .format(Number(amountMinor || 0) / 100)
}

function date(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function intervalLabel(interval) {
  return interval === 'year' ? 'yıl' : 'ay'
}

function dateRange(start, end) {
  if (!start && !end) return '—'
  return `${date(start)} – ${date(end)}`
}

function usageValue(key, value) {
  if (key === 'storage') return `${(Number(value || 0) / (1024 ** 3)).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} GB`
  return Number(value || 0).toLocaleString('tr-TR')
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-label="Faturalandırma yükleniyor">
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

function HostedPaymentFrame({ content, onClose }) {
  if (!content) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Güvenli ödeme ekranı">
      <div className="flex h-[min(760px,92vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div><p className="font-semibold">Güvenli ödeme</p><p className="text-xs text-gray-500">Kart bilgileri ContextHub sunucularına gönderilmez.</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Ödeme ekranını kapat"><XMarkIcon className="h-5 w-5" /></button>
        </div>
        <iframe title="Güvenli ödeme formu" srcDoc={content} sandbox="allow-forms allow-scripts allow-popups allow-top-navigation-by-user-activation" className="min-h-0 flex-1 border-0" />
      </div>
    </div>
  )
}

export default function Billing() {
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canView = hasPermission(PERMISSIONS.BILLING_VIEW)
  const canManage = hasPermission(PERMISSIONS.BILLING_MANAGE)
  const [interval, setInterval] = useState('month')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [profile, setProfile] = useState(EMPTY_PROFILE)
  const [hostedPaymentContent, setHostedPaymentContent] = useState('')
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
    if (checkoutStatus === 'success') toast.success('Abonelik ödemesi tamamlandı.')
    if (checkoutStatus === 'failed') toast.error('Ödeme sonucu doğrulanamadı. Kartınızdan tahsilat olduysa destekle iletişime geçin.')
    if (paymentMethodStatus === 'updated') toast.success('Ödeme yöntemi güncelleme işlemi tamamlandı.')
    if (checkoutStatus || paymentMethodStatus) {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [toast])

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
      else toast.error('Hosted checkout bağlantısı oluşturulamadı.')
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Checkout başlatılamadı.'),
  })
  const portal = useMutation({
    mutationFn: createBillingPortal,
    onSuccess: (result) => {
      if (result.portalUrl) window.location.assign(result.portalUrl)
      else if (result.paymentMethodUrl) window.location.assign(result.paymentMethodUrl)
      else if (result.paymentMethodContent) setHostedPaymentContent(result.paymentMethodContent)
      else toast.error('Customer portal bağlantısı oluşturulamadı.')
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Customer portal açılamadı.'),
  })
  const saveProfile = useMutation({
    mutationFn: updateBillingProfile,
    onSuccess: async () => {
      toast.success('Fatura bilgileri kaydedildi.')
      await overview.refetch()
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Fatura bilgileri kaydedilemedi.'),
  })

  const updateProfileField = (field, value) => setProfile((current) => ({ ...current, [field]: value }))
  const updateAddressField = (field, value) => setProfile((current) => ({ ...current, address: { ...current.address, [field]: value } }))

  const plans = useMemo(() => (overview.data?.plans || []).map((plan) => ({
    ...plan,
    selectedPrice: (plan.prices || []).find((price) => price.interval === interval) || null,
  })), [overview.data, interval])
  const usageEstimateByMetric = useMemo(() => Object.fromEntries(
    (overview.data?.charges?.usageEstimate?.lines || []).map((line) => [line.metric, line])
  ), [overview.data])

  if (!canView) {
    return <main style={TOKENS} className="min-h-[calc(100vh-4rem)] bg-[var(--billing-canvas)] p-8 text-[var(--billing-ink)]"><section className="mx-auto max-w-2xl rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--billing-warn)]">Yetki gerekli</p><h1 className="mt-2 text-2xl font-semibold">Faturalandırma yalnızca tenant owner tarafından görüntülenebilir.</h1><p className="mt-2 text-sm text-[var(--billing-muted)]">Paket, ödeme ve fatura bilgileri ticari hesap verisidir. Erişim için owner ile iletişime geçin.</p></section></main>
  }

  return (
    <main style={TOKENS} className="min-h-[calc(100vh-4rem)] bg-[var(--billing-canvas)] text-[var(--billing-ink)]">
      <HostedPaymentFrame content={hostedPaymentContent} onClose={() => setHostedPaymentContent('')} />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-[var(--billing-line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--billing-accent)]">Tenant aboneliği</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Faturalandırma ve limitler</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--billing-muted)]">Seçili tenant’ın paketi, yenilemesi, kota sinyalleri ve faturaları. Ödeme yöntemi fatura ülkenize göre güvenli ödeme ekranında yönetilir.</p>
          </div>
          {overview.data?.billingAccount?.hasProviderCustomer && canManage && (
            <button type="button" onClick={() => portal.mutate()} disabled={!online || portal.isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--billing-ink)] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
              <CreditCardIcon className="h-5 w-5" /> {portal.isPending ? 'Açılıyor…' : 'Ödeme ve aboneliği yönet'}
            </button>
          )}
        </header>

        {!online && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><ExclamationTriangleIcon className="h-5 w-5" /> Çevrimdışısınız; bilgiler önbellekten gösterilebilir, ödeme işlemleri kapalıdır.</div>
        )}

        {overview.isLoading ? <LoadingState /> : overview.isError ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-semibold text-red-900">Faturalandırma bilgileri alınamadı</h2>
            <p className="mt-1 text-sm text-red-700">Hesap migration’ı tamamlanmamış veya servis geçici olarak erişilemiyor olabilir.</p>
            <button type="button" onClick={() => overview.refetch()} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-900"><ArrowPathIcon className="h-4 w-4" /> Yeniden dene</button>
          </section>
        ) : (
          <>
            <section className="grid overflow-hidden rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] lg:grid-cols-[1.4fr_1fr]">
              <div className="p-6 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">Bu tenant’ın aktif paketi</p>
                <div className="mt-3 flex flex-wrap items-baseline gap-3"><h2 className="text-4xl font-semibold">{overview.data.tenant.plan.name}</h2><span className="rounded-full bg-[var(--billing-accent-soft)] px-3 py-1 text-xs font-bold text-[var(--billing-accent)]">{activePlanStatus(overview.data.tenant.plan, overview.data.subscription)}</span></div>
                <p className="mt-5 text-sm text-[var(--billing-muted)]">Tenant: {overview.data.tenant.name} · Fatura hesabı: {overview.data.account.name}</p>
              </div>
              <div className="border-t border-[var(--billing-line)] bg-[var(--billing-accent)] p-6 text-white lg:border-l lg:border-t-0 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">{overview.data.tenant.plan.slug === 'enterprise' && !overview.data.subscription ? 'Sözleşme dönemi' : 'Sonraki dönem'}</p>
                <p className="mt-3 text-2xl font-semibold">{overview.data.tenant.plan.slug === 'enterprise' && !overview.data.subscription ? 'Sözleşmeye göre' : date(overview.data.subscription?.currentPeriodEnd)}</p>
                <p className="mt-2 text-sm text-white/75">{overview.data.tenant.plan.slug === 'enterprise' && !overview.data.subscription ? 'Yenileme ve fatura dönemi kurumsal sözleşmenizde tanımlanır.' : overview.data.subscription?.cancelAtPeriodEnd ? 'Dönem sonunda iptal edilecek.' : 'Otomatik yenileme güvenli ödeme ekranında yönetilir.'}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-6 sm:p-8" aria-labelledby="billing-charge-summary">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">Dönem görünümü</p>
                  <h2 id="billing-charge-summary" className="mt-1 text-2xl font-semibold">Abonelik ve fatura bedelleri</h2>
                </div>
                <p className="max-w-xl text-sm text-[var(--billing-muted)]">Bedeller seçili tenant’a aittir. Vergi ve sözleşmeye bağlı düzeltmeler gerçek faturada kesinleşir.</p>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-3">
                <article className="rounded-xl border border-[var(--billing-line)] bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--billing-muted)]">{overview.data.charges.subscription.isEstimated ? 'Liste bedeli' : 'Aktif abonelik bedeli'}</p>
                  <p className="mt-3 text-3xl font-semibold">{money(overview.data.charges.subscription.amountMinor, overview.data.charges.subscription.currency)}</p>
                  <p className="mt-1 text-sm text-[var(--billing-muted)]">tenant / {intervalLabel(overview.data.charges.subscription.interval)}</p>
                  <p className="mt-4 text-xs leading-5 text-[var(--billing-muted)]">{overview.data.charges.subscription.isEstimated ? 'Aktif abonelik bulunmadığı için katalog bedeli gösteriliyor.' : dateRange(overview.data.charges.subscription.currentPeriodStart, overview.data.charges.subscription.currentPeriodEnd)}</p>
                </article>

                <article className="rounded-xl border border-[var(--billing-line)] bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--billing-muted)]">Bu dönem kullanım karşılığı</p>
                  {overview.data.charges.usageEstimate.available ? (
                    <>
                      <p className="mt-3 text-3xl font-semibold">{money(overview.data.charges.usageEstimate.amountMinor, overview.data.charges.usageEstimate.currency)}</p>
                      <p className="mt-1 text-sm text-[var(--billing-muted)]">mevcut depolama ve API kullanımı</p>
                      <p className="mt-4 text-xs leading-5 text-[var(--billing-muted)]">Bilgilendirme amaçlı karşılıktır; ödenecek tutar veya gerçek fatura toplamı değildir.</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-2xl font-semibold">Pakete dahil</p>
                      <p className="mt-1 text-sm text-[var(--billing-muted)]">Plan limitleri içinde ek kullanım bedeli hesaplanmaz.</p>
                    </>
                  )}
                </article>

                <article className="rounded-xl border border-[var(--billing-line)] bg-white p-5">
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--billing-muted)]">Son fatura</p>
                  {overview.data.charges.latestInvoice ? (
                    <>
                      <p className="mt-3 text-3xl font-semibold">{money(overview.data.charges.latestInvoice.totalMinor, overview.data.charges.latestInvoice.currency)}</p>
                      <p className="mt-1 text-sm text-[var(--billing-muted)]">{statusLabel(overview.data.charges.latestInvoice.status)} · {date(overview.data.charges.latestInvoice.billedAt)}</p>
                      <p className="mt-4 text-xs text-[var(--billing-muted)]">{overview.data.charges.latestInvoice.number || overview.data.charges.latestInvoice.id.slice(-8)}</p>
                    </>
                  ) : (
                    <>
                      <p className="mt-3 text-2xl font-semibold">Henüz yok</p>
                      <p className="mt-1 text-sm text-[var(--billing-muted)]">İlk fatura oluştuğunda tutarı burada görünecek.</p>
                    </>
                  )}
                </article>
              </div>
            </section>

            {(overview.data.quotaAlerts || []).length > 0 && (
              <section className="rounded-2xl border border-orange-200 bg-orange-50 p-6">
                <h2 className="font-semibold text-orange-950">Kota sinyalleri</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {overview.data.quotaAlerts.slice(0, 6).map((alert) => <div key={alert.id} className="rounded-xl bg-white p-4 text-sm"><strong>%{alert.threshold}</strong> · {alert.metric}<p className="mt-1 text-gray-600">{alert.usage.toLocaleString('tr-TR')} / {alert.limit.toLocaleString('tr-TR')}</p></div>)}
                </div>
              </section>
            )}

            <section>
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">Canlı kullanım</p><h2 className="mt-1 text-2xl font-semibold">Limitlere genel bakış</h2></div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(overview.data.usage || {}).map(([key, item]) => {
                  const estimate = usageEstimateByMetric[key]
                  return <article key={key} className="rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-5">
                    <div className="flex items-center justify-between"><p className="text-sm font-semibold capitalize">{({ users: 'Kullanıcı', owners: 'Owner', storage: 'Depolama', requests: 'API isteği' })[key]}</p><span className="text-xs font-bold text-[var(--billing-muted)]">{item.unlimited ? 'Sınırsız' : `%${item.percentage}`}</span></div>
                    <p className="mt-3 text-2xl font-semibold">{usageValue(key, item.usage)}</p>
                    <p className="mt-1 text-xs text-[var(--billing-muted)]">/ {item.unlimited ? 'sınırsız' : usageValue(key, item.limit)}</p>
                    {!item.unlimited && <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-[var(--billing-accent)]" style={{ width: `${item.percentage}%` }} /></div>}
                    {estimate && (
                      <div className="mt-4 border-t border-[var(--billing-line)] pt-4">
                        <div className="flex items-center justify-between gap-3 text-xs"><span className="text-[var(--billing-muted)]">Bilgilendirme karşılığı</span><strong>{money(estimate.amountMinor, overview.data.charges.usageEstimate.currency)}</strong></div>
                        <p className="mt-1 text-[11px] text-[var(--billing-muted)]">{estimate.unit === 'gb-month' ? `${money(estimate.unitPriceMinor, overview.data.charges.usageEstimate.currency)} / GB-ay` : `${money(estimate.unitPriceMinor, overview.data.charges.usageEstimate.currency)} / 1.000 istek`}</p>
                      </div>
                    )}
                  </article>
                })}
              </div>
            </section>

            <section className="grid overflow-hidden rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] lg:grid-cols-[1.6fr_0.8fr]" aria-labelledby="billing-profile-title">
              <form id="billing-profile" className="p-6 sm:p-8" onSubmit={(event) => { event.preventDefault(); saveProfile.mutate(profile) }}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">Fatura beyanı</p><h2 id="billing-profile-title" className="mt-1 text-2xl font-semibold">Fatura bilgileri</h2></div>
                  <div className="flex flex-wrap gap-2">
                    {overview.data.billingAccount?.profileComplete && <span className="w-fit rounded-full bg-[var(--billing-accent-soft)] px-3 py-1 text-xs font-bold text-[var(--billing-accent)]">Profil tamam</span>}
                    {overview.data.billingAccount?.commercialReadiness?.agreementAccepted && <span className="w-fit rounded-full border border-[var(--billing-accent)]/20 bg-white px-3 py-1 text-xs font-bold text-[var(--billing-accent)]">Sözleşme kayıtlı</span>}
                    {overview.data.billingAccount?.commercialReadiness?.paymentVerified && <span className="w-fit rounded-full border border-[var(--billing-accent)]/20 bg-white px-3 py-1 text-xs font-bold text-[var(--billing-accent)]">Ödeme doğrulandı</span>}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[var(--billing-muted)]">Fatura ülkesi güvenli ödeme akışını belirler. Türkiye adresleri yerel ödeme ve fatura kurallarına yönlendirilir.</p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-medium">Fatura türü<select className={INPUT_CLASS} value={profile.profileType} onChange={(event) => updateProfileField('profileType', event.target.value)} disabled={!canManage}><option value="business">Kurumsal</option><option value="individual">Bireysel</option></select></label>
                  <CountryCombobox value={profile.country} onChange={(country) => updateProfileField('country', country)} disabled={!canManage || overview.data.paymentRouting?.jurisdictionLocked} required />
                  <label className="text-sm font-medium sm:col-span-2">Fatura unvanı / ad soyad<input className={INPUT_CLASS} value={profile.legalName} onChange={(event) => updateProfileField('legalName', event.target.value)} maxLength={200} disabled={!canManage} required /></label>
                  <label className="text-sm font-medium">Yetkili adı<input className={INPUT_CLASS} value={profile.contactFirstName} onChange={(event) => updateProfileField('contactFirstName', event.target.value)} maxLength={100} disabled={!canManage} required={profile.country === 'TR'} /></label>
                  <label className="text-sm font-medium">Yetkili soyadı<input className={INPUT_CLASS} value={profile.contactLastName} onChange={(event) => updateProfileField('contactLastName', event.target.value)} maxLength={100} disabled={!canManage} required={profile.country === 'TR'} /></label>
                  <label className="text-sm font-medium">Fatura e-postası<input className={INPUT_CLASS} type="email" value={profile.billingEmail} onChange={(event) => updateProfileField('billingEmail', event.target.value)} maxLength={254} disabled={!canManage} required /></label>
                  <label className="text-sm font-medium">Telefon<input className={INPUT_CLASS} type="tel" value={profile.phone} onChange={(event) => updateProfileField('phone', event.target.value)} maxLength={30} placeholder="+90 5…" disabled={!canManage} required={profile.country === 'TR'} /></label>
                  <label className="text-sm font-medium">{profile.profileType === 'business' ? 'Vergi kimlik numarası' : 'T.C. kimlik numarası'}<input className={INPUT_CLASS} inputMode="numeric" value={profile.taxId} onChange={(event) => updateProfileField('taxId', event.target.value)} maxLength={11} placeholder={overview.data.billingAccount?.taxIdMasked || ''} disabled={!canManage} required={profile.country === 'TR' && !overview.data.billingAccount?.hasTaxId} /><span className="mt-1 block text-xs font-normal text-[var(--billing-muted)]">Kayıtlı numara yeniden gösterilmez; boş bırakırsanız mevcut değer korunur.</span></label>
                  {profile.profileType === 'business' && <label className="text-sm font-medium">Vergi dairesi<input className={INPUT_CLASS} value={profile.taxOffice} onChange={(event) => updateProfileField('taxOffice', event.target.value)} maxLength={120} disabled={!canManage} required={profile.country === 'TR'} /></label>}
                  <label className="text-sm font-medium sm:col-span-2">Adres<input className={INPUT_CLASS} value={profile.address.line1} onChange={(event) => updateAddressField('line1', event.target.value)} maxLength={250} disabled={!canManage} required /></label>
                  <label className="text-sm font-medium sm:col-span-2">Adres devamı<input className={INPUT_CLASS} value={profile.address.line2} onChange={(event) => updateAddressField('line2', event.target.value)} maxLength={250} disabled={!canManage} /></label>
                  <label className="text-sm font-medium">Şehir<input className={INPUT_CLASS} value={profile.address.city} onChange={(event) => updateAddressField('city', event.target.value)} maxLength={100} disabled={!canManage} required /></label>
                  <label className="text-sm font-medium">İlçe<input className={INPUT_CLASS} value={profile.address.district} onChange={(event) => updateAddressField('district', event.target.value)} maxLength={100} disabled={!canManage} /></label>
                  <label className="text-sm font-medium">Bölge / eyalet<input className={INPUT_CLASS} value={profile.address.region} onChange={(event) => updateAddressField('region', event.target.value)} maxLength={100} disabled={!canManage} /></label>
                  <label className="text-sm font-medium">Posta kodu<input className={INPUT_CLASS} value={profile.address.postalCode} onChange={(event) => updateAddressField('postalCode', event.target.value)} maxLength={24} disabled={!canManage} required /></label>
                </div>

                {canManage && <label className="mt-6 flex items-start gap-3 rounded-xl bg-[var(--billing-accent-soft)] p-4 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--billing-accent)]" checked={profile.declarationAccepted} onChange={(event) => updateProfileField('declarationAccepted', event.target.checked)} required /><span>Bu bilgilerin doğru, güncel ve fatura düzenlenmesi amacıyla kullanılabilir olduğunu beyan ediyorum.</span></label>}
                {canManage && <label className="mt-3 flex items-start gap-3 rounded-xl border border-[var(--billing-line)] bg-white p-4 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--billing-accent)]" checked={profile.serviceAgreementAccepted} onChange={(event) => updateProfileField('serviceAgreementAccepted', event.target.checked)} required /><span>ContextHub Cloud hizmet sözleşmesini ve seçtiğim tenant paketinin yenilenen ücretlendirme koşullarını kabul ediyorum.</span></label>}
                {overview.data.paymentRouting?.jurisdictionLocked && <p className="mt-3 text-xs text-[var(--billing-warn)]">Aktif abonelik sürerken fatura ülkesi değiştirilemez. Taşıma için destek süreci gerekir.</p>}
                {canManage && <button type="submit" disabled={!online || saveProfile.isPending || !profile.declarationAccepted || !profile.serviceAgreementAccepted} className="mt-5 rounded-xl bg-[var(--billing-ink)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-40">{saveProfile.isPending ? 'Kaydediliyor…' : 'Fatura ve sözleşme beyanını kaydet'}</button>}
              </form>

              <aside className="border-t border-[var(--billing-line)] bg-[#eef2ec] p-6 lg:border-l lg:border-t-0 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">Uygun ödeme yöntemleri</p>
                <div className="mt-4 space-y-3">
                  {(overview.data.paymentRouting?.paymentMethods || []).map((method) => <div key={method.key} className="rounded-xl border border-white/80 bg-white p-4"><div className="flex items-center gap-2 font-semibold"><CreditCardIcon className="h-5 w-5 text-[var(--billing-accent)]" />{method.label}</div><p className="mt-2 text-xs leading-5 text-[var(--billing-muted)]">{method.description}</p></div>)}
                </div>
                {!overview.data.paymentRouting?.profileComplete && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Ödeme yöntemleri ve ülkenize ait paket bedelleri için önce fatura profilini tamamlayın.</div>}
                {overview.data.paymentRouting?.profileComplete && !overview.data.paymentRouting?.checkoutAvailable && <div className="mt-4 rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-900">Bu fatura ülkesi için ödeme altyapısı henüz etkin değil. Başka bir sağlayıcıya otomatik yönlendirme yapılmaz.</div>}
                <p className="mt-5 text-xs leading-5 text-[var(--billing-muted)]">Ödeme kartı bilgileri ContextHub tarafından saklanmaz. Kart ekleme veya değiştirme güvenli ödeme ekranında tamamlanır.</p>
              </aside>
            </section>

            <section>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">Tenant başına sabit paketler</p><h2 className="mt-1 text-2xl font-semibold">Bu tenant için paketi seçin</h2></div>
                <div className="inline-flex rounded-xl border border-[var(--billing-line)] bg-white p-1" aria-label="Faturalandırma dönemi">
                  {[['month', 'Aylık'], ['year', 'Yıllık']].map(([key, label]) => <button key={key} type="button" onClick={() => setInterval(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${interval === key ? 'bg-[var(--billing-ink)] text-white' : 'text-[var(--billing-muted)]'}`}>{label}</button>)}
                </div>
              </div>
              {plans.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-[var(--billing-line)] p-8 text-center text-sm text-[var(--billing-muted)]">Paket kataloğu şu anda alınamıyor. Yeniden deneyin.</div> : (
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {plans.map((plan) => {
                    const price = plan.selectedPrice
                    const enterprise = plan.pricingMode === 'contract'
                    const current = overview.data.tenant.plan.slug === plan.slug
                    const hasSubscription = Boolean(overview.data.subscription && ['active', 'trialing', 'past_due', 'paused'].includes(overview.data.subscription.status))
                    const checkoutAvailable = Boolean(overview.data.paymentRouting?.checkoutAvailable)
                    const canCheckout = !enterprise && !current && !hasSubscription && canManage && online && checkoutAvailable && price?.checkoutReady && price?.id
                    const canOpenProfile = !enterprise && !current && !hasSubscription && canManage && online && !overview.data.paymentRouting?.profileComplete
                    const buttonLabel = checkoutButtonLabel({ current, enterprise, checkoutAvailable, checkoutReady: price?.checkoutReady, hasProfile: overview.data.paymentRouting?.profileComplete, hasSubscription })
                    return <article key={plan.id} className={`flex flex-col rounded-2xl border bg-[var(--billing-surface)] p-6 shadow-sm ${current ? 'border-[var(--billing-accent)] ring-2 ring-[var(--billing-accent-soft)]' : 'border-[var(--billing-line)]'}`}>
                      <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--billing-accent)]">{plan.marketing?.badge || plan.name}</p>{current && <span className="rounded-full bg-[var(--billing-accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--billing-accent)]">Aktif</span>}</div>
                      <h3 className="mt-2 text-2xl font-semibold">{plan.name}</h3>
                      <p className="mt-1 min-h-10 text-sm text-[var(--billing-muted)]">{plan.marketing?.tagline || plan.description}</p>
                      {enterprise ? <div className="mt-5"><p className="text-3xl font-semibold">Sözleşmeli fiyat</p><p className="mt-1 text-xs text-[var(--billing-muted)]">Kapsam ve hizmet seviyesine göre teklif edilir.</p></div> : price ? <div className="mt-5"><p className="text-3xl font-semibold">{money(price.amountMinor, price.currency)} <span className="text-sm font-normal text-[var(--billing-muted)]">/tenant/{interval === 'year' ? 'yıl' : 'ay'}</span></p>{price.catalogOnly && <p className="mt-1 text-xs text-[var(--billing-muted)]">Liste bedeli; ülkenize ait ödeme tutarı checkout açıldığında kesinleşir.</p>}</div> : <div className="mt-5"><p className="text-2xl font-semibold">Fiyat hazırlanıyor</p><p className="mt-1 text-xs text-[var(--billing-muted)]">Bu dönem için yerel fiyat henüz yayınlanmadı.</p></div>}
                      <ul className="mt-5 flex-1 space-y-2 text-sm">{(plan.capabilities || []).slice(0, 4).map((capability) => <li key={capability.key} className="flex gap-2"><CheckIcon className="h-5 w-5 shrink-0 text-[var(--billing-accent)]" /> {capability.label}</li>)}</ul>
                      {current ? <button type="button" disabled className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--billing-accent)] px-4 py-3 text-sm font-semibold text-white opacity-50">{buttonLabel}</button> : enterprise ? <a href="mailto:support@contexthub.com?subject=ContextHub%20Enterprise%20teklifi" className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--billing-accent)] px-4 py-3 text-sm font-semibold text-[var(--billing-accent)]">{buttonLabel} <ArrowTopRightOnSquareIcon className="h-4 w-4" /></a> : <button type="button" disabled={(!canCheckout && !canOpenProfile) || checkout.isPending} onClick={() => canCheckout ? checkout.mutate(price.id) : document.getElementById('billing-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--billing-accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">{buttonLabel} {canCheckout && <ArrowTopRightOnSquareIcon className="h-4 w-4" />}</button>}
                    </article>
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-6">
              <h2 className="text-xl font-semibold">Fatura geçmişi</h2>
              {(overview.data.invoices || []).length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-[var(--billing-line)] p-8 text-center text-sm text-[var(--billing-muted)]">Henüz fatura oluşmadı. İlk başarılı ödeme sonrasında burada görünecek.</div> : (
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-[var(--billing-muted)]"><tr><th className="py-3">Fatura</th><th>Dönem</th><th>Durum</th><th>Ara toplam</th><th>Vergi</th><th>Toplam</th><th className="text-right">Belge</th></tr></thead><tbody>{overview.data.invoices.map((invoice) => <tr key={invoice.id} className="border-t border-[var(--billing-line)]"><td className="py-4 font-medium">{invoice.number || invoice.id.slice(-8)}<span className="mt-1 block text-xs font-normal text-[var(--billing-muted)]">{date(invoice.billedAt)}</span></td><td>{dateRange(invoice.periodStart, invoice.periodEnd)}</td><td>{statusLabel(invoice.status)}</td><td>{money(invoice.subtotalMinor, invoice.currency)}</td><td>{money(invoice.taxMinor, invoice.currency)}</td><td className="font-semibold">{money(invoice.totalMinor, invoice.currency)}</td><td className="text-right">{invoice.documentUrl ? <a className="font-semibold text-[var(--billing-accent)]" href={invoice.documentUrl} target="_blank" rel="noreferrer">Aç</a> : '—'}</td></tr>)}</tbody></table></div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
