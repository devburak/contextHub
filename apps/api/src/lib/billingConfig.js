function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function isAccountBillingEnabled() {
  return envFlag('ACCOUNT_BILLING_ENABLED', false);
}

function getBillingProvider() {
  return String(process.env.BILLING_PROVIDER || '').trim().toLowerCase();
}

function getEnabledBillingProviders() {
  // Provider activation is deliberately fail-closed. Legacy BILLING_PROVIDER and
  // an absent allow-list must never turn payment collection on implicitly.
  const configured = String(process.env.BILLING_ENABLED_PROVIDERS || '')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider) => ['paddle', 'iyzico'].includes(provider));
  return [...new Set(configured)];
}

function envList(value, { lowercase = false } = {}) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .map((item) => (lowercase ? item.toLowerCase() : item))
    .filter(Boolean))];
}

function getIyzicoReviewTenantAllowlist(env = process.env) {
  return envList(env.IYZICO_REVIEW_TENANT_IDS);
}

function getIyzicoReviewUserEmailAllowlist(env = process.env) {
  return envList(env.IYZICO_REVIEW_USER_EMAILS, { lowercase: true });
}

function isIyzicoReviewCheckoutFallbackConfigured(env = process.env) {
  const environment = String(env.IYZICO_ENV || 'sandbox').trim().toLowerCase();
  const enabled = ['1', 'true', 'yes', 'on'].includes(
    String(env.IYZICO_REVIEW_CHECKOUT_FALLBACK || '').trim().toLowerCase()
  );
  return environment === 'sandbox' && enabled;
}

function isIyzicoReviewCheckoutFallbackEnabled({ tenantId, userEmail } = {}, env = process.env) {
  if (!isIyzicoReviewCheckoutFallbackConfigured(env)) return false;
  const tenantAllowlist = getIyzicoReviewTenantAllowlist(env);
  const userEmailAllowlist = getIyzicoReviewUserEmailAllowlist(env);
  if (tenantAllowlist.length === 0 || userEmailAllowlist.length === 0) return false;
  return Boolean(
    tenantId
    && userEmail
    && tenantAllowlist.includes(String(tenantId))
    && userEmailAllowlist.includes(String(userEmail).trim().toLowerCase())
  );
}

function isBillingProviderEnabled(provider) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  return getEnabledBillingProviders().includes(normalizedProvider);
}

module.exports = {
  envFlag,
  getEnabledBillingProviders,
  getIyzicoReviewTenantAllowlist,
  getIyzicoReviewUserEmailAllowlist,
  isAccountBillingEnabled,
  isBillingProviderEnabled,
  isIyzicoReviewCheckoutFallbackConfigured,
  isIyzicoReviewCheckoutFallbackEnabled,
  getBillingProvider,
};
