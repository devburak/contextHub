const TURKEY_COUNTRY_CODE = 'TR';
const DECLARATION_VERSION = 'billing-profile-v1';
const SERVICE_AGREEMENT_VERSION = 'ctxhub-cloud-terms-v4';
const {
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
} = require('@contexthub/common/src/billingProfileContract');

function resolveBillingProvider(country) {
  return normalizeCountry(country) === TURKEY_COUNTRY_CODE ? 'iyzico' : 'paddle';
}

function requiredProfileFields(profile = {}) {
  return requiredBillingProfileFields(profile);
}

function validateBillingProfile(profile = {}) {
  return validateBillingProfileFields(profile);
}

function paymentMethodsForCountry(country) {
  const normalizedCountry = normalizeCountry(country);
  if (!normalizedCountry) return [];
  if (normalizedCountry === TURKEY_COUNTRY_CODE) {
    return [{
      key: 'credit_card',
      label: 'Kredi kartı',
      description: 'Tekrarlayan ödemeye uygun kartlar güvenli ödeme ekranında yönetilir.',
    }];
  }
  return [{
    key: 'hosted_checkout',
    label: 'Kart ve uygun yerel yöntemler',
    description: 'Kullanılabilen yöntemler fatura ülkenize göre güvenli ödeme ekranında gösterilir.',
  }];
}

function maskTaxId(value) {
  const digits = normalizeDigits(value);
  if (!digits) return '';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

module.exports = {
  DECLARATION_VERSION,
  SERVICE_AGREEMENT_VERSION,
  SUPPORTED_BILLING_COUNTRY_CODES,
  TURKEY_COUNTRY_CODE,
  isSupportedBillingCountry,
  isValidBillingEmail,
  isValidBillingPhone,
  isValidBillingPostalCode,
  maskTaxId,
  normalizeBillingPhone,
  normalizeCountry,
  normalizeDigits,
  paymentMethodsForCountry,
  requiredProfileFields,
  resolveBillingProvider,
  validateBillingProfile,
};
