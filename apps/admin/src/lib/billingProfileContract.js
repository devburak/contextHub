export const SUPPORTED_BILLING_COUNTRY_CODES = `
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

const COUNTRY_SET = new Set(SUPPORTED_BILLING_COUNTRY_CODES)
const country = (value) => String(value || '').trim().toUpperCase().slice(0, 2)
const digits = (value) => String(value || '').replace(/\D/g, '')

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!email || email.length > 254) return false
  const separator = email.lastIndexOf('@')
  if (separator < 1 || separator > 64 || separator === email.length - 1) return false
  const domain = email.slice(separator + 1)
  return /^[^\s@]+$/.test(email.slice(0, separator)) && domain.includes('.') && domain.split('.').every((label) => (
    label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ))
}

function validPhone(value, countryCode) {
  const raw = String(value || '').trim()
  let phoneDigits = digits(raw)
  if (country(countryCode) === 'TR') {
    if (phoneDigits.length === 12 && phoneDigits.startsWith('90')) phoneDigits = phoneDigits.slice(2)
    if (phoneDigits.length === 11 && phoneDigits.startsWith('0')) phoneDigits = phoneDigits.slice(1)
    return /^[2-5]\d{9}$/.test(phoneDigits)
  }
  return raw.startsWith('+') && /^[1-9]\d{7,14}$/.test(phoneDigits)
}

function validPostalCode(value, countryCode) {
  const postalCode = String(value || '').trim()
  if (country(countryCode) === 'TR') return /^\d{5}$/.test(postalCode)
  return /^[a-z0-9](?:[a-z0-9 -]{0,10}[a-z0-9])?$/i.test(postalCode)
}

export function validateBillingProfileFields(profile = {}) {
  const countryCode = country(profile.country)
  const required = {
    billingEmail: profile.billingEmail,
    legalName: profile.legalName,
    profileType: profile.profileType,
    contactFirstName: profile.contactFirstName,
    contactLastName: profile.contactLastName,
    phone: profile.phone,
    country: countryCode,
    'address.line1': profile.address?.line1,
    'address.city': profile.address?.city,
    'address.postalCode': profile.address?.postalCode,
  }
  if (countryCode === 'TR') {
    required.taxId = profile.taxId || profile.hasTaxId
    if (profile.profileType === 'business') required.taxOffice = profile.taxOffice
  }
  required.declarationAccepted = profile.declarationAcceptedAt

  const missingFields = Object.entries(required).filter(([, value]) => !String(value || '').trim()).map(([field]) => field)
  const errors = {}
  if (countryCode && !COUNTRY_SET.has(countryCode)) errors.country = 'unsupported_country'
  if (profile.billingEmail && !validEmail(profile.billingEmail)) errors.billingEmail = 'invalid_email'
  if (profile.phone && !validPhone(profile.phone, countryCode)) errors.phone = 'invalid_phone'
  if (profile.address?.postalCode && !validPostalCode(profile.address.postalCode, countryCode)) {
    errors['address.postalCode'] = countryCode === 'TR' ? 'invalid_postal_code_tr' : 'invalid_postal_code'
  }
  if (profile.profileType && !['individual', 'business'].includes(profile.profileType)) errors.profileType = 'invalid_profile_type'
  if (countryCode === 'TR' && profile.taxId && !/^\d{10,11}$/.test(digits(profile.taxId))) errors.taxId = 'invalid_tax_id_tr'
  return { complete: missingFields.length === 0 && Object.keys(errors).length === 0, missingFields, errors }
}
