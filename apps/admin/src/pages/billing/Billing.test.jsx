import { describe, expect, it } from 'vitest'
import { activePlanStatus, checkoutButtonLabel } from './billingPresentation.js'

describe('billing presentation rules', () => {
  it('never describes a contract Enterprise plan as free', () => {
    expect(activePlanStatus({ slug: 'enterprise' }, null)).toBe('Sözleşmeli')
    expect(activePlanStatus({ slug: 'free' }, null)).toBe('Ücretsiz')
  })

  it('explains why a visible plan cannot start checkout yet', () => {
    expect(checkoutButtonLabel({
      current: false,
      enterprise: false,
      checkoutAvailable: false,
      checkoutReady: false,
      hasProfile: true,
      hasSubscription: false,
    })).toBe('Ödeme altyapısı hazırlanıyor')
  })
})
