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
