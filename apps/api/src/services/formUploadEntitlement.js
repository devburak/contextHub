/**
 * Plan gate for form file uploads.
 *
 * The mechanism lives in the open core, but which plan feature (if any) is
 * required is deployment configuration: FORM_UPLOADS_REQUIRED_FEATURE. When it
 * is unset, as on a self-hosted install, the feature is available to every tenant.
 */
const { Tenant } = require('@contexthub/common');
const tenantSubscriptionService = require('./tenantSubscriptionService');

function getRequiredFeature() {
  return (process.env.FORM_UPLOADS_REQUIRED_FEATURE || '').trim();
}

async function loadTenantFeatures(tenantId) {
  const tenant = await Tenant.findById(tenantId)
    .select('plan currentPlan')
    .populate('currentPlan')
    .lean();
  if (!tenant) return [];
  const plan = await tenantSubscriptionService.getPlanPayloadForTenant(tenant);
  return plan?.features || [];
}

async function isAllowed(tenantId, { loadFeatures = loadTenantFeatures } = {}) {
  const required = getRequiredFeature();
  if (!required) return true;
  const features = await loadFeatures(tenantId);
  return features.includes(required);
}

module.exports = {
  getRequiredFeature,
  isAllowed
};
