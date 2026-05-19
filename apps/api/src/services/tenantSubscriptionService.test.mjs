import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SubscriptionPlan = require('@contexthub/common/src/models/SubscriptionPlan');
const tenantSubscriptionService = require('./tenantSubscriptionService');

describe('tenantSubscriptionService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps free tenants on legacy free state without currentPlan', async () => {
    const tenant = {
      plan: 'promax',
      currentPlan: 'plan-promax',
      subscriptionStartDate: new Date('2026-04-01T00:00:00.000Z'),
      billingCycleStart: new Date('2026-04-01T00:00:00.000Z'),
    };

    const result = await tenantSubscriptionService.applyPlanToTenant(tenant, 'free');

    expect(result.changed).toBe(true);
    expect(tenant.plan).toBe('free');
    expect(tenant.currentPlan).toBeNull();
    expect(tenant.subscriptionStartDate).toBeNull();
    expect(tenant.billingCycleStart).toBeNull();
  });

  it('sets currentPlan and activation dates for paid plans', async () => {
    const planDoc = { _id: 'plan-pro', slug: 'pro' };
    vi.spyOn(SubscriptionPlan, 'getPlanBySlug').mockResolvedValue(planDoc);

    const tenant = {
      plan: 'free',
      currentPlan: null,
      subscriptionStartDate: null,
      billingCycleStart: null,
    };

    const result = await tenantSubscriptionService.applyPlanToTenant(tenant, 'pro');

    expect(result.changed).toBe(true);
    expect(tenant.plan).toBe('pro');
    expect(tenant.currentPlan).toBe('plan-pro');
    expect(tenant.subscriptionStartDate).toBeInstanceOf(Date);
    expect(tenant.billingCycleStart).toBeInstanceOf(Date);
  });

  it('prefers populated currentPlan over stale tenant plan strings', async () => {
    const tenant = {
      plan: 'free',
      currentPlan: {
        _id: 'plan-pro',
        slug: 'pro',
        name: 'Pro',
        price: 5,
        billingType: 'fixed',
        userLimit: 10,
        ownerLimit: 5,
        storageLimit: 5 * 1024 * 1024 * 1024,
        monthlyRequestLimit: 10000,
      },
      customLimits: {},
    };

    const plan = await tenantSubscriptionService.getPlanPayloadForTenant(tenant);
    const limits = await tenantSubscriptionService.getEffectiveLimits(tenant);

    expect(plan.slug).toBe('pro');
    expect(plan.name).toBe('Pro');
    expect(limits).toEqual({
      userLimit: 10,
      ownerLimit: 5,
      storageLimit: 5 * 1024 * 1024 * 1024,
      monthlyRequestLimit: 10000,
    });
  });

  it('falls back to tenant plan strings when currentPlan is missing', async () => {
    vi.spyOn(SubscriptionPlan, 'getPlanBySlug').mockResolvedValue({
      _id: 'plan-promax',
      slug: 'promax',
      name: 'Pro Max',
      price: 12,
      billingType: 'fixed',
      userLimit: null,
      ownerLimit: null,
      storageLimit: 10 * 1024 * 1024 * 1024,
      monthlyRequestLimit: 100000,
    });

    const tenant = {
      plan: 'promax',
      currentPlan: null,
      customLimits: {
        monthlyRequestLimit: -1,
      },
    };

    const plan = await tenantSubscriptionService.getPlanPayloadForTenant(tenant);
    const limits = await tenantSubscriptionService.getEffectiveLimits(tenant);

    expect(plan.slug).toBe('promax');
    expect(limits.userLimit).toBeNull();
    expect(limits.ownerLimit).toBeNull();
    expect(limits.storageLimit).toBe(10 * 1024 * 1024 * 1024);
    expect(limits.monthlyRequestLimit).toBe(-1);
  });

  it('builds recovery custom limits with defaults and overrides', () => {
    const limits = tenantSubscriptionService.buildRecoveryCustomLimits({
      userLimit: 50,
    });

    expect(limits).toEqual({
      userLimit: 50,
      ownerLimit: 5,
      storageLimit: -1,
      monthlyRequestLimit: -1,
    });
  });
});
