import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import {
  checkoutReturnTo,
  loginPathFor,
  signupPathFor,
} from '../../lib/returnTo.js'

const PLANS = [
  {
    slug: 'free',
    name: 'Free',
    featured: false,
    prices: { tr: { month: 0, year: 0 }, en: { month: 0, year: 0 } },
    copy: {
      tr: {
        tagline: 'Tek tenant ile keşfedin',
        features: ['1 kullanıcı / 1 owner', '500 MB depolama', 'Ayda 1.000 API isteği'],
      },
      en: {
        tagline: 'Explore with one tenant',
        features: ['1 user / 1 owner', '500 MB storage', '1,000 API requests per month'],
      },
    },
  },
  {
    slug: 'pro',
    name: 'Pro',
    featured: false,
    prices: { tr: { month: 499, year: 4990 }, en: { month: 12, year: 132 } },
    copy: {
      tr: {
        tagline: 'Üretim tenant’ları için',
        features: ['5 kullanıcı / 2 owner', '3 GB depolama', 'Ayda 50.000 API isteği'],
      },
      en: {
        tagline: 'For production tenants',
        features: ['5 users / 2 owners', '3 GB storage', '50,000 API requests per month'],
      },
    },
  },
  {
    slug: 'promax',
    name: 'Pro Max',
    featured: true,
    prices: { tr: { month: 1499, year: 14990 }, en: { month: 45, year: 450 } },
    copy: {
      tr: {
        tagline: 'Yüksek trafik ve geniş ekipler için',
        features: ['Sınırsız kullanıcı / 5 owner', '5 GB depolama', 'Ayda 150.000 API isteği'],
      },
      en: {
        tagline: 'For higher traffic and larger teams',
        features: ['Unlimited users / 5 owners', '5 GB storage', '150,000 API requests per month'],
      },
    },
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    featured: false,
    prices: null,
    copy: {
      tr: {
        tagline: 'Özel kapasite ve hizmet seviyesi',
        features: ['Sözleşmeli kullanıcı ve kota', 'Kurumsal güvenlik seçenekleri', 'SLA ve öncelikli destek'],
      },
      en: {
        tagline: 'Custom capacity and service levels',
        features: ['Contracted users and quotas', 'Enterprise security options', 'SLA and priority support'],
      },
    },
  },
]

const COPY = {
  tr: {
    eyebrow: 'TÜRKİYE · TRY · KDV DAHİL',
    title: 'Fiyatlandırma ve paketler',
    lead: 'ContextHub Cloud abonelikleri tenant başına fiyatlanır. Türkiye fatura adreslerinde tahsilat, yayımlanmış sabit TRY paket bedeli üzerinden yapılır.',
    month: 'Aylık',
    year: 'Yıllık',
    perMonth: 'tenant / ay',
    perYear: 'tenant / yıl',
    free: 'Ücretsiz',
    contract: 'Özel teklif',
    choose: 'Paketi seç',
    start: 'Ücretsiz başla',
    contact: 'Teklif iste',
    popular: 'En popüler',
    annualSaving: '2 ay avantajlı',
    currencyNote: '* TRY paket fiyatları USD liste fiyatı ve piyasa koşulları dikkate alınarak belirli dönemlerde gözden geçirilir. Kart anında kur çevrimi yapılmaz; ödeme ekranında gösterilen TRY tutarı ilgili tahsilat için sabittir.',
    renewalNote: 'Fiyat değişiklikleri yeni satın almalarda uygulanır. Mevcut abonelik yenilemeleri yürürlükteki sözleşme ve önceden bilgilendirme koşullarına tabidir.',
    taxNote: 'Türkiye paket fiyatlarına KDV dahildir. Tahsilat dönemi, yenileme ve toplam tutar güvenli ödeme ekranında tekrar gösterilir.',
    capabilities: 'Pro ve Pro Max; ekip iş akışları, Semantic Search, benzer içerik yönetimi ve yönetilen tenant yedekleme yeteneklerini içerir.',
    terms: 'Satın almadan önce hizmet koşulları, gizlilik aydınlatması, teslimat–iptal–iade şartları ve uygulanabildiği ölçüde mesafeli satış sözleşmesi incelenmelidir.',
    capabilitiesTitle: 'Dahil olan yetenekler',
    purchaseTitle: 'Satın alma ve yenileme',
    enterpriseSubject: 'ContextHub Enterprise teklifi',
  },
  en: {
    eyebrow: 'INTERNATIONAL · USD',
    title: 'Pricing and plans',
    lead: 'ContextHub Cloud subscriptions are priced per tenant. Billing addresses outside Türkiye use the published USD catalog.',
    month: 'Monthly',
    year: 'Annual',
    perMonth: 'tenant / month',
    perYear: 'tenant / year',
    free: 'Free',
    contract: 'Custom quote',
    choose: 'Choose plan',
    start: 'Start free',
    contact: 'Request a quote',
    popular: 'Most popular',
    annualSaving: 'Annual saving',
    currencyNote: 'USD prices apply to billing addresses outside Türkiye. The fixed TRY catalog for Türkiye billing addresses is reviewed periodically instead of using a card-time currency conversion.',
    renewalNote: 'Taxes, billing period, renewal terms, and the final payable amount are shown before purchase in the secure checkout.',
    taxNote: 'Türkiye TRY prices include VAT. Taxes applicable to international purchases are calculated and disclosed during checkout.',
    capabilities: 'Pro and Pro Max include team workflows, Semantic Search, related-content management, and managed tenant backup capabilities.',
    terms: 'Review the terms, privacy notice, delivery–cancellation–refund terms, and any applicable distance-selling agreement before purchase.',
    capabilitiesTitle: 'Included capabilities',
    purchaseTitle: 'Buying and renewal',
    enterpriseSubject: 'ContextHub Enterprise quote',
  },
}

function formatPrice(value, locale) {
  return new Intl.NumberFormat(locale === 'tr' ? 'tr-TR' : 'en-US', {
    style: 'currency',
    currency: locale === 'tr' ? 'TRY' : 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export default function PublicPricingPlans({ locale = 'en', isAuthenticated = false, activeTenantId = null }) {
  const normalizedLocale = locale === 'tr' ? 'tr' : 'en'
  const labels = COPY[normalizedLocale]
  const [interval, setInterval] = useState('month')

  return (
    <article className="docs-pricing" aria-labelledby="public-pricing-title">
      <header className="docs-pricing-intro">
        <div>
          <p className="docs-pricing-eyebrow">{labels.eyebrow}</p>
          <h1 id="public-pricing-title">{labels.title}</h1>
          <p>{labels.lead}</p>
        </div>
        <div className="docs-pricing-interval" role="group" aria-label={normalizedLocale === 'tr' ? 'Faturalandırma dönemi' : 'Billing interval'}>
          {['month', 'year'].map((item) => (
            <button
              key={item}
              type="button"
              className={interval === item ? 'is-active' : ''}
              aria-pressed={interval === item}
              onClick={() => setInterval(item)}
            >
              {item === 'month' ? labels.month : labels.year}
            </button>
          ))}
        </div>
      </header>

      <div className="docs-pricing-grid">
        {PLANS.map((plan) => {
          const planCopy = plan.copy[normalizedLocale]
          const price = plan.prices?.[normalizedLocale]?.[interval]
          const returnTo = checkoutReturnTo(plan.slug === 'free' ? 'free' : plan.slug, interval)
          const checkoutPath = isAuthenticated
            ? activeTenantId
              ? returnTo
              : `/select-tenant?returnTo=${encodeURIComponent(returnTo)}`
            : loginPathFor(returnTo)
          const href = plan.slug === 'enterprise'
            ? `mailto:support@ctxhub.net?subject=${encodeURIComponent(labels.enterpriseSubject)}`
            : plan.slug === 'free'
              ? isAuthenticated
                ? '/varliklar/yeni?plan=free&interval=month'
                : signupPathFor('/varliklar/yeni?plan=free&interval=month')
              : checkoutPath
          const action = plan.slug === 'enterprise'
            ? labels.contact
            : plan.slug === 'free'
              ? labels.start
              : labels.choose

          return (
            <section className={`docs-price-card${plan.featured ? ' is-featured' : ''}`} key={plan.slug}>
              {plan.featured && <span className="docs-price-badge"><Sparkles size={13} aria-hidden="true" /> {labels.popular}</span>}
              <div className="docs-price-card-heading">
                <h2>{plan.name}</h2>
                <p>{planCopy.tagline}</p>
              </div>
              <div className="docs-price-amount">
                <strong>
                  {plan.prices ? (price === 0 ? labels.free : formatPrice(price, normalizedLocale)) : labels.contract}
                  {normalizedLocale === 'tr' && price > 0 && <sup aria-label="fiyat açıklaması">*</sup>}
                </strong>
                {plan.prices && price > 0 && <span>{interval === 'year' ? labels.perYear : labels.perMonth}</span>}
                {interval === 'year' && plan.slug !== 'free' && plan.slug !== 'enterprise' && <small>{labels.annualSaving}</small>}
              </div>
              <ul>
                {planCopy.features.map((feature) => <li key={feature}><Check size={16} aria-hidden="true" /> <span>{feature}</span></li>)}
              </ul>
              <a className="docs-price-action" href={href}>{action}</a>
            </section>
          )
        })}
      </div>

      <aside className="docs-pricing-policy" aria-label={normalizedLocale === 'tr' ? 'Fiyat ve vergi açıklaması' : 'Pricing and tax notes'}>
        <p><strong>{labels.currencyNote}</strong></p>
        <p>{labels.renewalNote}</p>
        <p>{labels.taxNote}</p>
      </aside>

      <section
        id={normalizedLocale === 'tr' ? 'dahil-olan-yetenekler' : 'included-capabilities'}
        className="docs-pricing-details"
      >
        <h2>{labels.capabilitiesTitle}</h2>
        <p>{labels.capabilities}</p>
      </section>

      <section
        id={normalizedLocale === 'tr' ? 'satin-alma-ve-yenileme' : 'buying-and-renewal'}
        className="docs-pricing-details"
      >
        <h2>{labels.purchaseTitle}</h2>
        <p>{labels.terms}</p>
        <div className="docs-pricing-links">
          <a href="/docs/terms-of-service">{normalizedLocale === 'tr' ? 'Hizmet ve abonelik koşulları' : 'Terms and conditions'}</a>
          <a href="/docs/privacy-notice">{normalizedLocale === 'tr' ? 'Gizlilik aydınlatması' : 'Privacy notice'}</a>
          <a href="/docs/cancellation-and-refunds">{normalizedLocale === 'tr' ? 'Teslimat, iptal ve iade' : 'Delivery, cancellation and refunds'}</a>
          <a href="/docs/distance-sales-agreement">{normalizedLocale === 'tr' ? 'Mesafeli satış sözleşmesi' : 'Distance selling agreement'}</a>
        </div>
      </section>
    </article>
  )
}
