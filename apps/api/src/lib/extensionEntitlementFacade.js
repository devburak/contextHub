const { Tenant } = require('@contexthub/common');
const tenantSubscriptionService = require('../services/tenantSubscriptionService');

class ExtensionEntitlementFacadeError extends Error {
  constructor(message, code = 'EXTENSION_ENTITLEMENT_INVALID') {
    super(message);
    this.name = 'ExtensionEntitlementFacadeError';
    this.code = code;
  }
}

function normalizeRequiredFeatures(features) {
  const required = Array.isArray(features)
    ? features.filter(Boolean)
    : [features].filter(Boolean);
  if (!required.length) {
    throw new ExtensionEntitlementFacadeError('at least one feature is required');
  }
  return required;
}

function createExtensionEntitlementFacade(manifest, options = {}) {
  const declaredFeatures = new Set(manifest.featureKeys);
  const loadTenantFeatures = options.loadTenantFeatures || (async (tenantId) => {
    const tenant = await Tenant.findById(tenantId).select('plan currentPlan').lean();
    if (!tenant) return [];
    const plan = await tenantSubscriptionService.getPlanPayloadForTenant(tenant);
    return plan.features || [];
  });

  const validateDeclaration = (features) => {
    const required = normalizeRequiredFeatures(features);
    const undeclared = required.find((feature) => !declaredFeatures.has(feature));
    if (undeclared) {
      throw new ExtensionEntitlementFacadeError(
        `feature is not declared by plugin ${manifest.name}: ${undeclared}`,
        'EXTENSION_FEATURE_NOT_DECLARED'
      );
    }
    return required;
  };

  const evaluate = async (tenantId, features, mode) => {
    if (!['all', 'any'].includes(mode)) {
      throw new ExtensionEntitlementFacadeError('feature mode must be all or any');
    }
    const available = new Set(await loadTenantFeatures(tenantId));
    return mode === 'any'
      ? features.some((feature) => available.has(feature))
      : features.every((feature) => available.has(feature));
  };

  return Object.freeze({
    require({ features, mode = 'all' } = {}) {
      const required = validateDeclaration(features);
      if (!['all', 'any'].includes(mode)) {
        throw new ExtensionEntitlementFacadeError('feature mode must be all or any');
      }
      return async function requireExtensionEntitlement(request, reply) {
        const tenantId = String(request?.tenantId ?? '').trim();
        if (!tenantId) {
          return reply.code(403).send({
            error: 'TenantRequired',
            message: 'An authenticated tenant context is required',
          });
        }
        if (await evaluate(tenantId, required, mode)) return undefined;
        return reply.code(403).send({
          error: 'FeatureNotEntitled',
          message: 'The active subscription plan does not include this feature',
          features: required,
        });
      };
    },

    async has(request, features, { mode = 'all' } = {}) {
      const required = validateDeclaration(features);
      const tenantId = String(request?.tenantId ?? '').trim();
      if (!tenantId) return false;
      return evaluate(tenantId, required, mode);
    },
  });
}

module.exports = {
  ExtensionEntitlementFacadeError,
  createExtensionEntitlementFacade,
};
