import { describe, expect, it } from 'vitest'
import { validateBillingProfileForm } from './billingProfileValidation.js'

function validProfile(overrides = {}) {
  return {
    billingEmail: 'finance@example.com',
    legalName: 'Example A.Ş.',
    profileType: 'business',
    contactFirstName: 'Ada',
    contactLastName: 'Yılmaz',
    phone: '+90 555 111 22 33',
    country: 'TR',
    taxId: '1234567890',
    taxOffice: 'Kadıköy',
    address: { line1: 'Örnek Sokak 1', city: 'İstanbul', postalCode: '34710' },
    declarationAccepted: true,
    serviceAgreementAccepted: true,
    ...overrides,
  }
}

describe('billing profile form validation', () => {
  it('accepts a complete Turkish billing profile', () => {
    expect(validateBillingProfileForm(validProfile())).toEqual({})
  })

  it('returns field-specific email, phone, and postal-code errors', () => {
    expect(validateBillingProfileForm(validProfile({
      billingEmail: 'broken@',
      phone: '123',
      address: { line1: 'A street', city: 'City', postalCode: '34A10' },
    }))).toMatchObject({
      billingEmail: 'invalid_email',
      phone: 'invalid_phone',
      'address.postalCode': 'invalid_postal_code_tr',
    })
  })

  it('requires international E.164 phone numbers outside Turkey', () => {
    const errors = validateBillingProfileForm(validProfile({
      country: 'US',
      phone: '(415) 555-0100',
      taxId: '',
      taxOffice: '',
      address: { line1: '1 Market St', city: 'San Francisco', postalCode: '94105' },
    }))
    expect(errors.phone).toBe('invalid_phone')
  })
})
