import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  CreditCardIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext.jsx'
import { useToast } from '../../contexts/ToastContext.jsx'
import { PERMISSIONS } from '../../constants/permissions.js'
import { createBillingCheckout, createBillingPortal, fetchBillingOverview } from '../../lib/api/billing.js'
import TenantTabs from '../../components/TenantTabs.jsx'

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

function money(amountMinor, currency = 'USD') {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency, maximumFractionDigits: 0 })
    .format(Number(amountMinor || 0) / 100)
}

function date(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

function statusLabel(status) {
  return ({ free: 'Ücretsiz', active: 'Aktif', trialing: 'Deneme', past_due: 'Ödeme bekliyor', canceled: 'İptal', paid: 'Ödendi', open: 'Açık' })[status] || status || '—'
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

export default function Billing() {
  const toast = useToast()
  const { hasPermission } = useAuth()
  const canView = hasPermission(PERMISSIONS.BILLING_VIEW)
  const canManage = hasPermission(PERMISSIONS.BILLING_MANAGE)
  const [interval, setInterval] = useState('month')
  const [online, setOnline] = useState(() => navigator.onLine)
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

  const checkout = useMutation({
    mutationFn: createBillingCheckout,
    onSuccess: (result) => {
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl)
      else toast.error('Hosted checkout bağlantısı oluşturulamadı.')
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Checkout başlatılamadı.'),
  })
  const portal = useMutation({
    mutationFn: createBillingPortal,
    onSuccess: (result) => {
      if (result.portalUrl) window.location.assign(result.portalUrl)
      else toast.error('Customer portal bağlantısı oluşturulamadı.')
    },
    onError: (error) => toast.error(error.response?.data?.message || 'Customer portal açılamadı.'),
  })

  const prices = useMemo(() => (overview.data?.prices || []).filter((item) => item.interval === interval), [overview.data, interval])

  if (!canView) {
    return <main style={TOKENS} className="min-h-[calc(100vh-4rem)] bg-[var(--billing-canvas)] p-8 text-[var(--billing-ink)]"><section className="mx-auto max-w-2xl rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--billing-warn)]">Yetki gerekli</p><h1 className="mt-2 text-2xl font-semibold">Faturalandırma yalnızca tenant owner tarafından görüntülenebilir.</h1><p className="mt-2 text-sm text-[var(--billing-muted)]">Paket, ödeme ve fatura bilgileri ticari hesap verisidir. Erişim için owner ile iletişime geçin.</p></section></main>
  }

  return (
    <main style={TOKENS} className="min-h-[calc(100vh-4rem)] bg-[var(--billing-canvas)] text-[var(--billing-ink)]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <TenantTabs active="billing" />
        <header className="flex flex-col gap-4 border-b border-[var(--billing-line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--billing-accent)]">Tenant aboneliği</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Faturalandırma ve limitler</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--billing-muted)]">Seçili tenant’ın paketi, yenilemesi, kota sinyalleri ve faturaları. Ödeme bilgileri Paddle’ın güvenli sayfalarında yönetilir.</p>
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
                <div className="mt-3 flex flex-wrap items-baseline gap-3"><h2 className="text-4xl font-semibold">{overview.data.tenant.plan.name}</h2><span className="rounded-full bg-[var(--billing-accent-soft)] px-3 py-1 text-xs font-bold text-[var(--billing-accent)]">{statusLabel(overview.data.subscription?.status || 'free')}</span></div>
                <p className="mt-5 text-sm text-[var(--billing-muted)]">Tenant: {overview.data.tenant.name} · Fatura hesabı: {overview.data.account.name}</p>
              </div>
              <div className="border-t border-[var(--billing-line)] bg-[var(--billing-accent)] p-6 text-white lg:border-l lg:border-t-0 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">Sonraki dönem</p>
                <p className="mt-3 text-2xl font-semibold">{date(overview.data.subscription?.currentPeriodEnd)}</p>
                <p className="mt-2 text-sm text-white/75">{overview.data.subscription?.cancelAtPeriodEnd ? 'Dönem sonunda iptal edilecek.' : 'Otomatik yenileme durumu provider portalında yönetilir.'}</p>
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
                {Object.entries(overview.data.usage || {}).map(([key, item]) => <article key={key} className="rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-5">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold capitalize">{({ users: 'Kullanıcı', owners: 'Owner', storage: 'Depolama', requests: 'API isteği' })[key]}</p><span className="text-xs font-bold text-[var(--billing-muted)]">{item.unlimited ? 'Sınırsız' : `%${item.percentage}`}</span></div>
                  <p className="mt-3 text-2xl font-semibold">{usageValue(key, item.usage)}</p>
                  <p className="mt-1 text-xs text-[var(--billing-muted)]">/ {item.unlimited ? 'sınırsız' : usageValue(key, item.limit)}</p>
                  {!item.unlimited && <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-200"><div className="h-full rounded-full bg-[var(--billing-accent)]" style={{ width: `${item.percentage}%` }} /></div>}
                </article>)}
              </div>
            </section>

            <section>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--billing-muted)]">Tenant başına sabit paketler</p><h2 className="mt-1 text-2xl font-semibold">Bu tenant için paketi seçin</h2></div>
                <div className="inline-flex rounded-xl border border-[var(--billing-line)] bg-white p-1" aria-label="Faturalandırma dönemi">
                  {[['month', 'Aylık'], ['year', 'Yıllık']].map(([key, label]) => <button key={key} type="button" onClick={() => setInterval(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${interval === key ? 'bg-[var(--billing-ink)] text-white' : 'text-[var(--billing-muted)]'}`}>{label}</button>)}
                </div>
              </div>
              {prices.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-[var(--billing-line)] p-8 text-center text-sm text-[var(--billing-muted)]">Bu dönem için checkout’a açık paket bulunmuyor.</div> : (
                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  {prices.map((price) => <article key={price.key} className="flex flex-col rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-6 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--billing-accent)]">{price.plan?.marketing?.badge || price.plan?.name}</p>
                    <h3 className="mt-2 text-2xl font-semibold">{price.plan?.name}</h3>
                    <p className="mt-1 min-h-10 text-sm text-[var(--billing-muted)]">{price.plan?.marketing?.tagline || price.plan?.description}</p>
                    <p className="mt-5 text-3xl font-semibold">{money(price.amountMinor, price.currency)} <span className="text-sm font-normal text-[var(--billing-muted)]">/tenant/{interval === 'year' ? 'yıl' : 'ay'}</span></p>
                    <ul className="mt-5 flex-1 space-y-2 text-sm">{(price.plan?.capabilities || []).slice(0, 4).map((capability) => <li key={capability.key} className="flex gap-2"><CheckIcon className="h-5 w-5 shrink-0 text-[var(--billing-accent)]" /> {capability.label}</li>)}</ul>
                    <button type="button" disabled={!canManage || !online || !price.checkoutReady || checkout.isPending || Boolean(overview.data.subscription && ['active', 'trialing', 'past_due', 'paused'].includes(overview.data.subscription.status))} onClick={() => checkout.mutate(price.key)} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--billing-accent)] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Hosted checkout <ArrowTopRightOnSquareIcon className="h-4 w-4" /></button>
                  </article>)}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-6">
              <h2 className="text-xl font-semibold">Fatura geçmişi</h2>
              {(overview.data.invoices || []).length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-[var(--billing-line)] p-8 text-center text-sm text-[var(--billing-muted)]">Henüz fatura oluşmadı. İlk başarılı ödeme sonrasında burada görünecek.</div> : (
                <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-xs uppercase tracking-wide text-[var(--billing-muted)]"><tr><th className="py-3">Fatura</th><th>Tarih</th><th>Durum</th><th>Tutar</th><th className="text-right">Belge</th></tr></thead><tbody>{overview.data.invoices.map((invoice) => <tr key={invoice.id} className="border-t border-[var(--billing-line)]"><td className="py-4 font-medium">{invoice.number || invoice.id.slice(-8)}</td><td>{date(invoice.billedAt)}</td><td>{statusLabel(invoice.status)}</td><td>{money(invoice.totalMinor, invoice.currency)}</td><td className="text-right">{invoice.documentUrl ? <a className="font-semibold text-[var(--billing-accent)]" href={invoice.documentUrl} target="_blank" rel="noreferrer">Aç</a> : '—'}</td></tr>)}</tbody></table></div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
