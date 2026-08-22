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

module.exports = {
  envFlag,
  isAccountBillingEnabled,
  getBillingProvider,
};
