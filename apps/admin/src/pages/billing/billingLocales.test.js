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

  it('identifies the legal provider and separates corporate and product domains', () => {
    for (const catalog of [tr, en]) {
      expect(catalog['billing.legal.termsProvider']).toContain('İKONX Bilişim ve Tarım Sanayi ve Ticaret Ltd. Şti.')
      expect(catalog['billing.legal.termsCompanyDetails']).toContain('4701114216')
      expect(catalog['billing.legal.termsCompanyDetails']).toContain('0470111421600001')
      expect(catalog['billing.legal.termsProvider']).toContain('ikon-x.com.tr')
      expect(catalog['billing.legal.termsProvider']).toContain('ctxhub.net')
      expect(catalog['billing.legal.privacyController']).toContain('İKONX Bilişim ve Tarım Sanayi ve Ticaret Ltd. Şti.')
      expect(catalog['billing.legal.privacyRights']).toContain('support@ctxhub.net')
    }
  })
})
