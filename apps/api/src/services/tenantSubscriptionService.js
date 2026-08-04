const SubscriptionPlan = require('@contexthub/common/src/models/SubscriptionPlan');
const { DEFAULT_SUBSCRIPTION_PLANS } = require('../lib/defaultSubscriptionPlans');

const VALID_PLAN_SLUGS = new Set(DEFAULT_SUBSCRIPTION_PLANS.map((plan) => plan.slug));
const DEFAULT_PLAN_BY_SLUG = new Map(DEFAULT_SUBSCRIPTION_PLANS.map((plan) => [plan.slug, plan]));
const DEFAULT_RECOVERY_CUSTOM_LIMITS = Object.freeze({
  userLimit: 25,
  ownerLimit: 5,
  storageLimit: -1,
  monthlyRequestLimit: -1,
});
const LIMIT_FIELD_TO_PLAN_FIELD = Object.freeze({
  userLimit: 'users',
  ownerLimit: 'owners',
  storageLimit: 'storage',
  monthlyRequestLimit: 'requests',
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

  getDefaultPlanBySlug(planSlug = 'free') {
    const normalizedPlanSlug = VALID_PLAN_SLUGS.has(planSlug) ? planSlug : 'free';
    return DEFAULT_PLAN_BY_SLUG.get(normalizedPlanSlug) || DEFAULT_PLAN_BY_SLUG.get('free');
  }

  getEffectivePlanSlug(tenant) {
    const referencedSlug =
      tenant?.currentPlan &&
      typeof tenant.currentPlan === 'object' &&
      typeof tenant.currentPlan.slug === 'string'
        ? tenant.currentPlan.slug.trim().toLowerCase()
        : null;

    if (referencedSlug && VALID_PLAN_SLUGS.has(referencedSlug)) {
      return referencedSlug;
    }

    const storedSlug = String(tenant?.plan || 'free').trim().toLowerCase();
    return VALID_PLAN_SLUGS.has(storedSlug) ? storedSlug : 'free';
  }

  buildPlanPayload(plan, fallbackSlug = 'free') {
    const normalizedFallback = VALID_PLAN_SLUGS.has(fallbackSlug) ? fallbackSlug : 'free';
    const defaults = this.getDefaultPlanBySlug(normalizedFallback);
    const source = plan || defaults;
    const slug = source.slug || normalizedFallback;
    const getValue = (field) => (source[field] !== undefined ? source[field] : defaults[field]);

    return {
      id: source._id ? this.getPlanId(source) : null,
      slug,
      name: getValue('name'),
      description: getValue('description'),
      price: getValue('price'),
      billingType: getValue('billingType'),
      limits: {
        users: getValue('userLimit'),
        owners: getValue('ownerLimit'),
        storage: getValue('storageLimit'),
        requests: getValue('monthlyRequestLimit'),
      },
    };
  }

  async getEffectivePlan(tenant) {
    const effectiveSlug = this.getEffectivePlanSlug(tenant);
    const currentPlan = tenant?.currentPlan;

    if (
      currentPlan &&
      typeof currentPlan === 'object' &&
      typeof currentPlan.slug === 'string' &&
      VALID_PLAN_SLUGS.has(currentPlan.slug)
    ) {
      return currentPlan;
    }

    if (effectiveSlug !== 'free') {
      const plan = await SubscriptionPlan.getPlanBySlug(effectiveSlug);
      if (plan) {
        return plan;
      }
    }

    return this.getDefaultPlanBySlug(effectiveSlug);
  }

  async getPlanPayloadForTenant(tenant) {
    const effectiveSlug = this.getEffectivePlanSlug(tenant);
    const plan = await this.getEffectivePlan(tenant);
    return this.buildPlanPayload(plan, effectiveSlug);
  }

  async getEffectiveLimit(tenant, limitType) {
    if (tenant?.customLimits && tenant.customLimits[limitType] !== null && tenant.customLimits[limitType] !== undefined) {
      return tenant.customLimits[limitType];
    }

    const planPayload = await this.getPlanPayloadForTenant(tenant);
    const planField = LIMIT_FIELD_TO_PLAN_FIELD[limitType];
    if (planField && planPayload.limits[planField] !== undefined) {
      return planPayload.limits[planField];
    }

    return 0;
  }

  async getEffectiveLimits(tenant) {
    return {
      userLimit: await this.getEffectiveLimit(tenant, 'userLimit'),
      ownerLimit: await this.getEffectiveLimit(tenant, 'ownerLimit'),
      storageLimit: await this.getEffectiveLimit(tenant, 'storageLimit'),
      monthlyRequestLimit: await this.getEffectiveLimit(tenant, 'monthlyRequestLimit'),
    };
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

  /**
   * Yetki (entitlement) degisimini calisan sisteme yayar.
   *
   * Plan degisimi, ozel limit guncellemesi ve ileride eklenecek odeme
   * webhook'lari bu tek noktadan gecmelidir. Kullanim sayaci gecikmeli
   * calisabilir, ama YETKI gecikmeli olamaz: musteri paketini yukselttiginde
   * bir sonraki istegi acik olmali, dusurdugunde/odemesi basarisiz oldugunda
   * gecikmeden kisitlanmalidir.
   *
   * Tenant `save()` edildikten SONRA cagrilmalidir; kaynak dogruluk Mongo'dur.
   *
   * Yapilan is:
   *  1. tenant limit cache'ini dusur (Redis)
   *  2. aylik istek kota bayragini yeniden hesaplayip yaz (hot path bunu okur)
   *  3. tenant config'ini edge KV'ye it (edge gateway kapaliysa no-op)
   */
  async syncEntitlementState(tenantId, { reason = 'entitlement_change' } = {}) {
    if (!tenantId) {
      throw new Error('tenantId is required');
    }

    const id = String(tenantId);
    const result = { tenantId: id, reason, cacheInvalidated: false, limitFlag: null, edge: null };

    // Dongusel import olmamasi icin lazy require.
    const localRedisClient = require('../lib/localRedis');
    const apiUsageService = require('./apiUsageService');
    const edgeGatewaySyncService = require('./edgeGatewaySyncService');

    try {
      result.cacheInvalidated = await localRedisClient.invalidateTenantCache(id);
    } catch (error) {
      console.warn(`[TenantSubscription] Failed to invalidate tenant cache (${id}):`, error.message);
    }

    try {
      const state = await apiUsageService.refreshMonthlyLimitFlag(id);
      result.limitFlag = {
        limit: state?.limit ?? null,
        usage: state?.usage ?? null,
        exceeded: state?.exceeded ?? false,
        periodKey: state?.periodKey ?? null,
      };
    } catch (error) {
      console.error(`[TenantSubscription] Failed to refresh request limit flag (${id}):`, error.message);
    }

    try {
      result.edge = await edgeGatewaySyncService.syncTenantConfig({ tenantId: id });
    } catch (error) {
      console.error(`[TenantSubscription] Failed to sync tenant config to edge KV (${id}):`, error.message);
      result.edge = { skipped: true, reason: 'edge_sync_failed', error: error.message };
    }

    return result;
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
