const TURKEY_COUNTRY_CODE = 'TR';
const DECLARATION_VERSION = 'billing-profile-v1';
const SERVICE_AGREEMENT_VERSION = 'ctxhub-cloud-terms-v1';

function normalizeCountry(value) {
  return String(value || '').trim().toUpperCase().slice(0, 2);
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function resolveBillingProvider(country) {
  return normalizeCountry(country) === TURKEY_COUNTRY_CODE ? 'iyzico' : 'paddle';
}

function requiredProfileFields(profile = {}) {
  const country = normalizeCountry(profile.country);
  const common = [
    ['billingEmail', profile.billingEmail],
    ['legalName', profile.legalName],
    ['country', country],
    ['address.line1', profile.address?.line1],
    ['address.city', profile.address?.city],
    ['address.postalCode', profile.address?.postalCode],
  ];

  if (country === TURKEY_COUNTRY_CODE) {
    const hasTaxId = Boolean(profile.taxId || profile.taxIdLast4 || profile.hasTaxId);
    common.push(
      ['profileType', profile.profileType],
      ['contactFirstName', profile.contactFirstName],
      ['contactLastName', profile.contactLastName],
      ['phone', profile.phone],
      ['taxId', hasTaxId ? 'stored' : '']
    );
    if (profile.profileType === 'business') common.push(['taxOffice', profile.taxOffice]);
  }

  if (!profile.declarationAcceptedAt) common.push(['declarationAccepted', null]);
  return common.filter(([, value]) => !String(value || '').trim()).map(([field]) => field);
}

function validateBillingProfile(profile = {}) {
  const missingFields = requiredProfileFields(profile);
  const errors = {};
  const country = normalizeCountry(profile.country);

  if (country && country.length !== 2) errors.country = 'Ülke iki harfli ISO kodu olmalıdır.';
  if (profile.billingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.billingEmail)) {
    errors.billingEmail = 'Geçerli bir fatura e-posta adresi girin.';
  }
  if (country === TURKEY_COUNTRY_CODE) {
    const taxId = normalizeDigits(profile.taxId);
    if (taxId && !/^\d{10,11}$/.test(taxId)) errors.taxId = 'VKN 10, TCKN 11 haneli olmalıdır.';
    const phone = normalizeDigits(profile.phone);
    if (phone && (phone.length < 10 || phone.length > 15)) errors.phone = 'Geçerli bir telefon numarası girin.';
    if (profile.profileType && !['individual', 'business'].includes(profile.profileType)) {
      errors.profileType = 'Fatura türü bireysel veya kurumsal olmalıdır.';
    }
  }

  return { complete: missingFields.length === 0 && Object.keys(errors).length === 0, missingFields, errors };
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
  TURKEY_COUNTRY_CODE,
  maskTaxId,
  normalizeCountry,
  normalizeDigits,
  paymentMethodsForCountry,
  requiredProfileFields,
  resolveBillingProvider,
  validateBillingProfile,
};
