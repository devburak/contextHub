import { describe, expect, it } from 'vitest'
import { activePlanStatus, checkoutButtonLabel } from './billingPresentation.js'

const translations = {
  'billing.status.contract': 'Contracted',
  'billing.status.free': 'Free',
  'billing.checkout.unavailable': 'Payment processing is coming soon',
}
const t = (key, options = {}) => translations[key] || options.defaultValue || key

describe('billing presentation rules', () => {
  it('never describes a contract Enterprise plan as free', () => {
    expect(activePlanStatus(t, { slug: 'enterprise' }, null)).toBe('Contracted')
    expect(activePlanStatus(t, { slug: 'free' }, null)).toBe('Free')
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
