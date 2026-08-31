import { SUPPORTED_BILLING_COUNTRY_CODES } from './billingProfileContract.js'

function countryName(code, locale) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}

export function buildBillingCountries(locale = 'tr-TR') {
  return SUPPORTED_BILLING_COUNTRY_CODES
    .map((code) => ({ code, name: countryName(code, locale) }))
    .sort((left, right) => left.name.localeCompare(right.name, locale))
}

export const BILLING_COUNTRIES = buildBillingCountries('tr-TR')
