function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function isAccountBillingEnabled() {
  return envFlag('ACCOUNT_BILLING_ENABLED', false);
}

function getBillingProvider() {
  return String(process.env.BILLING_PROVIDER || 'paddle').trim().toLowerCase();
}

function getEnabledBillingProviders() {
  const configured = String(process.env.BILLING_ENABLED_PROVIDERS || getBillingProvider())
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider) => ['paddle', 'iyzico'].includes(provider));
  return [...new Set(configured)];
}

function isBillingProviderEnabled(provider) {
  return getEnabledBillingProviders().includes(String(provider || '').trim().toLowerCase());
}

module.exports = {
  envFlag,
  getEnabledBillingProviders,
  isAccountBillingEnabled,
  isBillingProviderEnabled,
  getBillingProvider,
};
