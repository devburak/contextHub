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

function getBillingProviderTenantAllowlist(provider) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (normalizedProvider !== 'iyzico') return [];
  return [...new Set(String(process.env.IYZICO_REVIEW_TENANT_IDS || '')
    .split(',')
    .map((tenantId) => tenantId.trim())
    .filter(Boolean))];
}

function isBillingProviderEnabled(provider, tenantId = null) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  if (!getEnabledBillingProviders().includes(normalizedProvider)) return false;
  const tenantAllowlist = getBillingProviderTenantAllowlist(normalizedProvider);
  if (tenantAllowlist.length === 0) return true;
  return Boolean(tenantId && tenantAllowlist.includes(String(tenantId)));
}

module.exports = {
  envFlag,
  getBillingProviderTenantAllowlist,
  getEnabledBillingProviders,
  isAccountBillingEnabled,
  isBillingProviderEnabled,
  getBillingProvider,
};
