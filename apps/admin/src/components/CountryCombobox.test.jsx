import { describe, expect, it } from 'vitest'
import { BILLING_COUNTRIES } from './CountryCombobox.jsx'

describe('billing country catalog', () => {
  it('contains unique ISO alpha-2 countries and a searchable Turkish label for Turkey', () => {
    expect(BILLING_COUNTRIES.length).toBeGreaterThan(240)
    expect(new Set(BILLING_COUNTRIES.map((country) => country.code)).size).toBe(BILLING_COUNTRIES.length)
    expect(BILLING_COUNTRIES.find((country) => country.code === 'TR')).toMatchObject({ name: 'Türkiye' })
    expect(BILLING_COUNTRIES.every((country) => /^[A-Z]{2}$/.test(country.code))).toBe(true)
  })
})
