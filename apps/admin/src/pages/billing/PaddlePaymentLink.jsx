import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import LanguageSwitcher from '../../components/LanguageSwitcher.jsx'
import './PaddlePaymentLink.css'
import { loadPaddleJs } from './paddleJs.js'

let initializedConfiguration = null

export default function PaddlePaymentLink({
  clientToken = import.meta.env.VITE_PADDLE_CLIENT_TOKEN || '',
  environment = import.meta.env.VITE_PADDLE_ENV || 'live',
  paddleLoader = loadPaddleJs,
}) {
  const { t } = useTranslation()
  const [status, setStatus] = useState(clientToken ? 'preparing' : 'unavailable')

  useEffect(() => {
    let active = true

    // The approved default-payment-link page always includes Paddle.js. Collection
    // remains visibly fail-closed until a client-side token is published.
    paddleLoader()
      .then((paddle) => {
        if (!active || !clientToken) return
        if (!paddle?.Initialize) throw new Error('Paddle.js is unavailable')

        const normalizedEnvironment = String(environment).trim().toLowerCase()
        const configurationKey = `${normalizedEnvironment}:${clientToken}`
        if (initializedConfiguration !== configurationKey) {
          if (normalizedEnvironment === 'sandbox') paddle.Environment?.set?.('sandbox')
          paddle.Initialize({
            token: clientToken,
            checkout: {
              settings: {
                displayMode: 'overlay',
                theme: 'light',
              },
            },
          })
          initializedConfiguration = configurationKey
        }
        setStatus('ready')
      })
      .catch(() => {
        if (active && clientToken) setStatus('failed')
      })

    return () => {
      active = false
    }
  }, [clientToken, environment, paddleLoader])

  const statusContent = {
    preparing: { title: t('pay.preparing'), body: t('pay.description') },
    ready: { title: t('pay.ready'), body: t('pay.description') },
    unavailable: { title: t('pay.unavailable_title'), body: t('pay.unavailable_body') },
    failed: { title: t('pay.failed_title'), body: t('pay.failed_body') },
  }[status]

  return (
    <div className="paddle-payment-page">
      <div className="paddle-payment-shell">
        <nav className="paddle-payment-nav" aria-label={t('footer.public_information')}>
          <a className="paddle-payment-brand" href="/login">
            <span className="paddle-payment-brand-mark" aria-hidden="true">C</span>
            <span>ContextHub</span>
          </a>
          <div className="paddle-payment-nav-links">
            <a href="/docs/pricing-and-plans">{t('footer.pricing')}</a>
            <a href="/docs/terms-of-service">{t('footer.terms')}</a>
            <a href="/docs/privacy-notice">{t('footer.privacy')}</a>
            <a href="/docs/cancellation-and-refunds">{t('footer.refunds')}</a>
            <LanguageSwitcher persistToProfile={false} />
          </div>
        </nav>

        <main className="paddle-payment-grid">
          <section className="paddle-payment-intro">
            <p className="paddle-payment-eyebrow">{t('pay.eyebrow')}</p>
            <h1>{t('pay.title')}</h1>
            <p className="paddle-payment-description">{t('pay.description')}</p>
          </section>

          <section className="paddle-payment-checkout" aria-live="polite">
            <div className="paddle-payment-status">
              {status === 'preparing' && <span className="paddle-payment-pulse" aria-hidden="true" />}
              <h2>{statusContent.title}</h2>
              <p>{statusContent.body}</p>
            </div>
          </section>
        </main>

        <footer className="paddle-payment-footer">
          <p>{t('pay.merchant')}</p>
          <div className="paddle-payment-policy-links">
            <a href="/login">{t('pay.back')}</a>
            <a href="mailto:support@ctxhub.net">{t('pay.support')}</a>
          </div>
        </footer>
      </div>
    </div>
  )
}
