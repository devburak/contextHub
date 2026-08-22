import { describe, expect, it } from 'vitest'
import tr from '../../locales/tr/billing.json'
import en from '../../locales/en/billing.json'

describe('billing locale catalog', () => {
  it('keeps Turkish and English billing keys in parity', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort())
  })

  it('provides English copy for commercial and country-selection states', () => {
    expect(en['billing.header.title']).toBe('Billing and limits')
    expect(en['billing.status.contract']).toBe('Contracted')
    expect(en['billing.country.placeholder']).toContain('ISO code')
    expect(en['billing.checkout.start']).toContain('secure checkout')
  })

  it('discloses distributed infrastructure and international data transfers in both locales', () => {
    expect(tr['billing.legal.termsInfrastructure']).toContain('AB/AEA')
    expect(tr['billing.legal.privacyInternationalTransfer']).toContain('KVKK’nın 9. maddesi')
    expect(en['billing.legal.termsInfrastructure']).toContain('EU/EEA')
    expect(en['billing.legal.privacyInternationalTransfer']).toContain('Article 9')
  })
})
