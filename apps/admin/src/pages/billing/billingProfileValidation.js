import { validateBillingProfileFields } from '../../lib/billingProfileContract.js'

export function validateBillingProfileForm(profile, { hasStoredTaxId = false } = {}) {
  const result = validateBillingProfileFields({
    ...profile,
    hasTaxId: hasStoredTaxId,
    declarationAcceptedAt: profile.declarationAccepted ? new Date() : null,
  })
  const errors = { ...result.errors }

  for (const field of result.missingFields) errors[field] ||= 'required'
  if (!profile.serviceAgreementAccepted) errors.serviceAgreementAccepted = 'required'
  return errors
}

export function localizeBillingProfileErrors(t, errors = {}) {
  return Object.fromEntries(Object.entries(errors).map(([field, code]) => [
    field,
    t(`billing.validation.${code}`, { defaultValue: t('billing.validation.invalid') }),
  ]))
}

export function errorsFromBillingResponse(t, error) {
  const details = error?.response?.data?.details || {}
  const errors = { ...(details.errors || {}) }
  for (const field of details.missingFields || []) errors[field] ||= 'required'
  return localizeBillingProfileErrors(t, errors)
}
