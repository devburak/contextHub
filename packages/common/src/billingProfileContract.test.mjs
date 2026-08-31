import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const {
  isSupportedBillingCountry,
  isValidBillingEmail,
  isValidBillingPostalCode,
  normalizeBillingPhone,
  validateBillingProfileFields,
} = require('./billingProfileContract.js')

describe('billing profile contract', () => {
  it('validates supported ISO countries and billing email addresses', () => {
    expect(isSupportedBillingCountry('tr')).toBe(true)
    expect(isSupportedBillingCountry('XX')).toBe(false)
    expect(isValidBillingEmail('finance@example.com')).toBe(true)
    expect(isValidBillingEmail('broken@')).toBe(false)
  })

  it('normalizes Turkish phones and requires E.164 elsewhere', () => {
    expect(normalizeBillingPhone('0555 111 22 33', 'TR')).toBe('+905551112233')
    expect(normalizeBillingPhone('90 555 111 22 33', 'TR')).toBe('+905551112233')
    expect(normalizeBillingPhone('+1 (415) 555-0100', 'US')).toBe('+14155550100')
    expect(normalizeBillingPhone('(415) 555-0100', 'US')).toBe('')
  })

  it('applies country-aware postal-code rules', () => {
    expect(isValidBillingPostalCode('34710', 'TR')).toBe(true)
    expect(isValidBillingPostalCode('34A10', 'TR')).toBe(false)
    expect(isValidBillingPostalCode('SW1A 1AA', 'GB')).toBe(true)
  })

  it('returns stable field error codes', () => {
    const result = validateBillingProfileFields({
      billingEmail: 'invalid',
      legalName: 'Example',
      profileType: 'business',
      contactFirstName: 'Ada',
      contactLastName: 'Yılmaz',
      phone: '123',
      country: 'TR',
      taxId: '1234567890',
      taxOffice: 'Kadıköy',
      address: { line1: 'Street 1', city: 'İstanbul', postalCode: '34A10' },
      declarationAcceptedAt: new Date(),
    })
    expect(result.errors).toEqual({
      billingEmail: 'invalid_email',
      phone: 'invalid_phone',
      'address.postalCode': 'invalid_postal_code_tr',
    })
  })
})
