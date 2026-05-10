const SubscriptionPlan = require('@contexthub/common/src/models/SubscriptionPlan');
const { DEFAULT_SUBSCRIPTION_PLANS } = require('../lib/defaultSubscriptionPlans');

const VALID_PLAN_SLUGS = new Set(DEFAULT_SUBSCRIPTION_PLANS.map((plan) => plan.slug));
const DEFAULT_RECOVERY_CUSTOM_LIMITS = Object.freeze({
  userLimit: 25,
  ownerLimit: 5,
  storageLimit: -1,
  monthlyRequestLimit: -1,
});

class TenantSubscriptionService {
  normalizePlanSlug(planSlug = 'free') {
    const normalized = String(planSlug || 'free').trim().toLowerCase();
    if (!VALID_PLAN_SLUGS.has(normalized)) {
      throw new Error(`Unsupported subscription plan: ${planSlug}`);
    }
    return normalized;
  }

  getPlanId(plan) {
    if (!plan) return null;
    if (typeof plan === 'string') return plan;
    if (typeof plan.toString === 'function' && !plan._id) {
      return plan.toString();
    }
    if (plan._id) {
      return typeof plan._id.toString === 'function' ? plan._id.toString() : String(plan._id);
    }
    return null;
  }

  async resolvePlan(planSlug) {
    const normalizedPlanSlug = this.normalizePlanSlug(planSlug);
    if (normalizedPlanSlug === 'free') {
      return {
        normalizedPlanSlug,
        plan: null,
      };
    }

    const plan = await SubscriptionPlan.getPlanBySlug(normalizedPlanSlug);
    if (!plan) {
      throw new Error(`Subscription plan '${normalizedPlanSlug}' is not available`);
    }

    return {
      normalizedPlanSlug,
      plan,
    };
  }

  async applyPlanToTenant(
    tenant,
    planSlug,
    { trackActivation = true, resetDatesOnFree = true } = {}
  ) {
    if (!tenant) {
      throw new Error('Tenant is required');
    }

    const { normalizedPlanSlug, plan } = await this.resolvePlan(planSlug);
    const previousPlanId = this.getPlanId(tenant.currentPlan);
    const nextPlanId = this.getPlanId(plan);
    const planChanged = previousPlanId !== nextPlanId || tenant.plan !== normalizedPlanSlug;
    let changed = false;

    if (tenant.plan !== normalizedPlanSlug) {
      tenant.plan = normalizedPlanSlug;
      changed = true;
    }

    if (previousPlanId !== nextPlanId) {
      tenant.currentPlan = plan ? plan._id : null;
      changed = true;
    }

    if (normalizedPlanSlug === 'free') {
      if (resetDatesOnFree && tenant.subscriptionStartDate !== null) {
        tenant.subscriptionStartDate = null;
        changed = true;
      }
      if (resetDatesOnFree && tenant.billingCycleStart !== null) {
        tenant.billingCycleStart = null;
        changed = true;
      }
      return {
        changed,
        planChanged,
        normalizedPlanSlug,
        plan,
      };
    }

    const activationDate =
      trackActivation && (previousPlanId !== nextPlanId || !tenant.subscriptionStartDate)
        ? new Date()
        : null;

    if (activationDate || !tenant.subscriptionStartDate) {
      tenant.subscriptionStartDate = activationDate || tenant.subscriptionStartDate || new Date();
      changed = true;
    }

    if (activationDate || !tenant.billingCycleStart) {
      tenant.billingCycleStart = activationDate || tenant.billingCycleStart || new Date();
      changed = true;
    }

    return {
      changed,
      planChanged,
      normalizedPlanSlug,
      plan,
    };
  }

  buildRecoveryCustomLimits(overrides = {}) {
    const next = { ...DEFAULT_RECOVERY_CUSTOM_LIMITS };
    for (const [key, value] of Object.entries(overrides || {})) {
      if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
      if (value === undefined) continue;
      next[key] = value;
    }
    return next;
  }

  applyCustomLimits(tenant, customLimits = {}) {
    if (!tenant) {
      throw new Error('Tenant is required');
    }

    const nextLimits = {
      ...(tenant.customLimits || {}),
      ...customLimits,
    };

    const currentSerialized = JSON.stringify(tenant.customLimits || {});
    const nextSerialized = JSON.stringify(nextLimits);
    if (currentSerialized === nextSerialized) {
      return false;
    }

    tenant.customLimits = nextLimits;
    return true;
  }
}

const tenantSubscriptionService = new TenantSubscriptionService();

module.exports = tenantSubscriptionService;
module.exports.DEFAULT_RECOVERY_CUSTOM_LIMITS = DEFAULT_RECOVERY_CUSTOM_LIMITS;
module.exports.VALID_PLAN_SLUGS = Array.from(VALID_PLAN_SLUGS);
