import { describe, expect, it } from 'vitest'
import { activePlanStatus, checkoutButtonLabel, contractPresentation } from './billingPresentation.js'

const translations = {
  'billing.status.contract': 'Contracted',
  'billing.status.free': 'Free',
  'billing.checkout.unavailable': 'Payment processing is coming soon',
}
const t = (key, options = {}) => translations[key] || options.defaultValue || key

describe('billing presentation rules', () => {
  it('never describes a contract Enterprise plan as free', () => {
    expect(activePlanStatus(t, { slug: 'enterprise' }, null)).toBe('Contracted')
    expect(activePlanStatus(t, { slug: 'enterprise' }, { status: 'active' })).toBe('Contracted')
    expect(activePlanStatus(t, { slug: 'free' }, null)).toBe('Free')
  })

  it('does not present an unknown contract price as free or a catalogue charge', () => {
    const overview = { tenant: { plan: { slug: 'enterprise' } } }
    expect(contractPresentation(overview)).toEqual({ managed: true, pricePending: true })
    overview.charges = { subscription: { amountMinor: null, isEstimated: false } }
    expect(contractPresentation(overview).pricePending).toBe(true)
    overview.charges.subscription = { amountMinor: 25000, isEstimated: true }
    expect(contractPresentation(overview).pricePending).toBe(true)
    overview.charges.subscription = { amountMinor: 25000, isEstimated: false }
    expect(contractPresentation(overview).pricePending).toBe(false)
    overview.charges.subscription.amountMinor = 0
    expect(contractPresentation(overview).pricePending).toBe(false)
    expect(contractPresentation({ tenant: { plan: { slug: 'pro' } } })).toEqual({ managed: false, pricePending: false })
  })

  it('explains why a visible plan cannot start checkout yet', () => {
    expect(checkoutButtonLabel(t, {
      current: false,
      enterprise: false,
      checkoutAvailable: false,
      checkoutReady: false,
      hasProfile: true,
      hasSubscription: false,
    })).toBe('Payment processing is coming soon')
  })
})
