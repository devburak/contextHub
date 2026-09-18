import { useEffect, useRef, useState } from 'react'
import { createPlanChangeQuote, confirmPlanChange } from '../../lib/api/billing.js'

const button = 'rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--billing-accent)] disabled:cursor-not-allowed disabled:opacity-50'

export default function PlanChangeDialog({ selection, tenantId, canManage, online, t, locale, onClose, onCheckout, onError }) {
  const dialog = useRef(null)
  const mounted = useRef(false)
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [attempt, setAttempt] = useState(0)
  const expired = quote && now >= new Date(quote.quoteExpiresAt).getTime()
  const money = (value) => new Intl.NumberFormat(locale, { style: 'currency', currency: quote?.currency || 'TRY' }).format(value / 100)
  const date = (value) => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value))

  useEffect(() => {
    mounted.current = true
    const node = dialog.current
    node?.showModal?.()
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { mounted.current = false; window.clearInterval(timer); node?.close?.() }
  }, [])

  useEffect(() => {
    if (selection.enterprise || !canManage || !online) return undefined
    let canceled = false
    setBusy(true); setError(''); setQuote(null); setAccepted(false)
    createPlanChangeQuote(selection.priceId).then((result) => {
      if (!canceled && result.tenantId === tenantId) setQuote(result)
    }).catch((failure) => {
      if (canceled) return
      const message = failure.response?.data?.message || t('billing.change.error')
      setError(message); onError(message)
    }).finally(() => { if (!canceled) setBusy(false) })
    return () => { canceled = true }
  }, [selection.priceId, selection.enterprise, tenantId, canManage, online, attempt])

  const confirm = async () => {
    if (busy || !accepted || !quote || expired || !online || !canManage) return
    setBusy(true); setError('')
    try {
      const result = await confirmPlanChange(quote.id)
      if (mounted.current) onCheckout(result)
    } catch (failure) {
      if (!mounted.current) return
      const message = failure.response?.data?.message || t('billing.change.error')
      setError(message); onError(message)
    } finally { if (mounted.current) setBusy(false) }
  }

  return <dialog ref={dialog} aria-labelledby="plan-change-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose() }} className="m-auto w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-[var(--billing-line)] bg-[var(--billing-surface)] p-6 text-[var(--billing-ink)] shadow-2xl backdrop:bg-black/60 sm:p-8">
    <h2 id="plan-change-title" className="text-2xl font-semibold">{t(selection.enterprise ? 'billing.change.enterpriseTitle' : 'billing.change.title')}</h2>
    {selection.enterprise ? <>
      <p className="mt-4 text-sm leading-6 text-[var(--billing-muted)]">{t('billing.change.enterpriseDescription')}</p>
      <a href={`mailto:support@ctxhub.net?subject=${encodeURIComponent(`ContextHub Enterprise — ${selection.tenantName || tenantId}`)}`} className={`${button} mt-6 inline-flex bg-[var(--billing-accent)] text-white`}>{t('billing.change.contact')}</a>
    </> : <>
      <p className="mt-3 text-sm leading-6 text-[var(--billing-muted)]">{t('billing.change.description')}</p>
      {!online && <p role="status" className="mt-4 text-sm text-[var(--billing-warn)]">{t('billing.offline')}</p>}
      {!canManage && <p role="alert" className="mt-4 text-sm text-[var(--billing-warn)]">{t('billing.permission.description')}</p>}
      {busy && !quote && <div role="status" aria-label={t('billing.loading')} className="mt-6 h-40 animate-pulse rounded-xl bg-[var(--billing-accent-soft)] motion-reduce:animate-none" />}
      {quote && <>
        <p className="mt-5 font-semibold">{quote.fromPlanName} → {quote.toPlanName}</p>
        <div className="mt-4 rounded-xl bg-[var(--billing-accent-soft)] p-5">
          <p className="text-sm text-[var(--billing-accent)]">{t('billing.change.oneTime')}</p>
          <p className="mt-2 text-4xl font-semibold">{money(quote.amountMinor)}</p>
          <p className="mt-2 text-xs text-[var(--billing-muted)]">{t('billing.change.taxAndProration')}</p>
        </div>
        <dl className="mt-5 space-y-4 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-[var(--billing-muted)]">{t('billing.change.recurring')}</dt><dd className="text-right font-semibold">{money(quote.recurringAmountMinor)} / {t(`billing.interval.${quote.interval}`)}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-[var(--billing-muted)]">{t('billing.change.renewal')}</dt><dd className="font-semibold">{date(quote.renewalAt)}</dd></div>
        </dl>
        <p className="mt-5 text-xs leading-5 text-[var(--billing-muted)]">{t('billing.change.noSecondSubscription')}</p>
        <label className="mt-5 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[var(--billing-accent)]" checked={accepted} disabled={busy || expired} onChange={(event) => setAccepted(event.target.checked)} /><span>{t('billing.change.consent', { amount: money(quote.amountMinor), recurring: money(quote.recurringAmountMinor), date: date(quote.renewalAt) })}</span></label>
        {expired && <p role="status" className="mt-4 text-sm text-[var(--billing-warn)]">{t('billing.change.expired')}</p>}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-[var(--billing-warn)]">{error}</p>}
      {(error || expired) && <button type="button" disabled={busy || !online} onClick={() => setAttempt((value) => value + 1)} className={`${button} mt-3 border border-[var(--billing-line)]`}>{t('billing.change.recalculate')}</button>}
      <button type="button" disabled={!quote || !accepted || busy || expired || !online || !canManage} onClick={confirm} className={`${button} mt-6 w-full bg-[var(--billing-accent)] text-white`}>{t(busy ? 'billing.change.processing' : 'billing.change.confirm')}</button>
    </>}
    <button type="button" disabled={busy} onClick={onClose} className={`${button} mt-3 w-full border border-[var(--billing-line)]`}>{t('billing.change.close')}</button>
  </dialog>
}
