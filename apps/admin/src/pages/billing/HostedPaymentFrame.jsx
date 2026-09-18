import { useEffect, useRef, useState } from 'react'
import { ArrowTopRightOnSquareIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { hostedPaymentDocument } from './hostedPaymentDocument.js'

const HTML_SANDBOX = 'allow-forms allow-scripts allow-popups allow-top-navigation-by-user-activation'
// Only a validated, cross-origin provider URL gets storage access. Never use
// allow-same-origin for HTML injected into the admin origin via srcDoc.
const PROVIDER_SANDBOX = 'allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'

export default function HostedPaymentFrame({ content, page, onClose, onError, t, language }) {
  const dialog = useRef(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const visible = Boolean(content || page)

  useEffect(() => {
    if (!visible) return undefined
    const node = dialog.current
    const previousFocus = document.activeElement
    node?.showModal?.()
    return () => {
      node?.close?.()
      if (previousFocus?.isConnected) previousFocus.focus?.()
    }
  }, [visible])

  useEffect(() => { setLoading(true); setFailed(false); setAttempt(0) }, [content, page?.frameUrl])

  useEffect(() => {
    if (!page || !loading) return undefined
    const timer = window.setTimeout(() => {
      setLoading(false); setFailed(true)
      onError?.(t('billing.securePayment.loadError'))
    }, 15000)
    return () => window.clearTimeout(timer)
  }, [page, loading, attempt, onError, t])

  if (!visible) return null
  return (
    <dialog ref={dialog} role="dialog" aria-modal="true" aria-label={t('billing.securePayment.title')}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      className="m-auto h-[min(760px,92dvh)] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border-0 bg-[var(--billing-surface)] p-0 text-[var(--billing-ink)] shadow-2xl backdrop:bg-black/60">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--billing-line)] px-5 py-4">
          <div><p className="font-semibold">{t('billing.securePayment.title')}</p><p className="text-xs text-[var(--billing-muted)]">{t('billing.securePayment.description')}</p></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[var(--billing-muted)] hover:bg-[var(--billing-accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--billing-accent)]" aria-label={t('billing.securePayment.close')}><XMarkIcon className="h-5 w-5" /></button>
        </div>
        {page && loading && <p role="status" className="shrink-0 bg-[var(--billing-accent-soft)] px-5 py-3 text-sm">{t('billing.securePayment.loading')}</p>}
        <iframe key={`${page ? 'provider' : 'html'}-${attempt}`} title={t('billing.securePayment.frameTitle')}
          {...(page ? { src: page.frameUrl } : { srcDoc: hostedPaymentDocument(content, language) })}
          sandbox={page ? PROVIDER_SANDBOX : HTML_SANDBOX} referrerPolicy="no-referrer"
          onLoad={() => { setLoading(false); setFailed(false) }}
          onError={() => { setLoading(false); setFailed(true); onError?.(t('billing.securePayment.loadError')) }}
          className="min-h-0 w-full flex-1 border-0 bg-white" />
        {page && <div className="shrink-0 border-t border-[var(--billing-line)] px-5 py-3 text-xs text-[var(--billing-muted)]">
          {failed && <div className="mb-3 flex items-center justify-between gap-3">
            <p role="alert" className="text-[var(--billing-warn)]">{t('billing.securePayment.loadError')}</p>
            <button type="button" onClick={() => { setFailed(false); setLoading(true); setAttempt((value) => value + 1) }} className="shrink-0 rounded-lg border border-[var(--billing-line)] px-3 py-2 font-semibold">{t('billing.action.retry')}</button>
          </div>}
          <p>{t('billing.securePayment.fallbackHint')}</p>
          <a href={page.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-2 rounded text-sm font-semibold text-[var(--billing-accent)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--billing-accent)]">
            {t('billing.securePayment.openExternal')}<ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        </div>}
      </div>
    </dialog>
  )
}
