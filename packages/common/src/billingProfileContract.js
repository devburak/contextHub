const SUPPORTED_BILLING_COUNTRY_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/)

const SUPPORTED_BILLING_COUNTRY_SET = new Set(SUPPORTED_BILLING_COUNTRY_CODES)

function normalizeCountry(value) {
  return String(value || '').trim().toUpperCase().slice(0, 2)
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function isSupportedBillingCountry(value) {
  return SUPPORTED_BILLING_COUNTRY_SET.has(normalizeCountry(value))
}

function isValidBillingEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email || email.length > 254) return false
  const separator = email.lastIndexOf('@')
  if (separator < 1 || separator > 64 || separator === email.length - 1) return false
  const local = email.slice(0, separator)
  const domain = email.slice(separator + 1)
  if (!/^[^\s@]+$/.test(local) || !domain.includes('.')) return false
  return domain.split('.').every((label) => (
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ))
}

function normalizeBillingPhone(value, country) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const normalizedCountry = normalizeCountry(country)
  const digits = normalizeDigits(raw)

  if (normalizedCountry === 'TR') {
    let national = digits
    if (national.length === 12 && national.startsWith('90')) national = national.slice(2)
    if (national.length === 11 && national.startsWith('0')) national = national.slice(1)
    return /^[2-5]\d{9}$/.test(national) ? `+90${national}` : ''
  }

  if (!raw.startsWith('+') || !/^[1-9]\d{7,14}$/.test(digits)) return ''
  return `+${digits}`
}

function isValidBillingPhone(value, country) {
  return Boolean(normalizeBillingPhone(value, country))
}

function isValidBillingPostalCode(value, country) {
  const postalCode = String(value || '').trim()
  if (normalizeCountry(country) === 'TR') return /^\d{5}$/.test(postalCode)
  return /^[a-z0-9](?:[a-z0-9 -]{0,10}[a-z0-9])?$/i.test(postalCode)
}

function requiredBillingProfileFields(profile = {}) {
  const country = normalizeCountry(profile.country)
  const common = [
    ['billingEmail', profile.billingEmail],
    ['legalName', profile.legalName],
    ['profileType', profile.profileType],
    ['contactFirstName', profile.contactFirstName],
    ['contactLastName', profile.contactLastName],
    ['phone', profile.phone],
    ['country', country],
    ['address.line1', profile.address?.line1],
    ['address.city', profile.address?.city],
    ['address.postalCode', profile.address?.postalCode],
  ]

  if (country === 'TR') {
    const hasTaxId = Boolean(profile.taxId || profile.taxIdLast4 || profile.hasTaxId)
    common.push(['taxId', hasTaxId ? 'stored' : ''])
    if (profile.profileType === 'business') common.push(['taxOffice', profile.taxOffice])
  }

  if (!profile.declarationAcceptedAt) common.push(['declarationAccepted', null])
  return common.filter(([, value]) => !String(value || '').trim()).map(([field]) => field)
}

function validateBillingProfileFields(profile = {}) {
  const missingFields = requiredBillingProfileFields(profile)
  const errors = {}
  const country = normalizeCountry(profile.country)

  if (country && !isSupportedBillingCountry(country)) errors.country = 'unsupported_country'
  if (profile.billingEmail && !isValidBillingEmail(profile.billingEmail)) errors.billingEmail = 'invalid_email'
  if (profile.phone && !isValidBillingPhone(profile.phone, country)) errors.phone = 'invalid_phone'
  if (profile.address?.postalCode && !isValidBillingPostalCode(profile.address.postalCode, country)) {
    errors['address.postalCode'] = country === 'TR' ? 'invalid_postal_code_tr' : 'invalid_postal_code'
  }
  if (profile.profileType && !['individual', 'business'].includes(profile.profileType)) {
    errors.profileType = 'invalid_profile_type'
  }
  if (country === 'TR') {
    const taxId = normalizeDigits(profile.taxId)
    if (taxId && !/^\d{10,11}$/.test(taxId)) errors.taxId = 'invalid_tax_id_tr'
  }

  return {
    complete: missingFields.length === 0 && Object.keys(errors).length === 0,
    missingFields,
    errors,
  }
}

module.exports = {
  SUPPORTED_BILLING_COUNTRY_CODES,
  isSupportedBillingCountry,
  isValidBillingEmail,
  isValidBillingPhone,
  isValidBillingPostalCode,
  normalizeBillingPhone,
  normalizeCountry,
  normalizeDigits,
  requiredBillingProfileFields,
  validateBillingProfileFields,
}
