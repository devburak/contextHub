import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const SubscriptionPlan = require('@contexthub/common/src/models/SubscriptionPlan');
const { BillingAccount, BillingSubscription } = require('@contexthub/common');
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
      _id: 'tenant-1',
      accountId: 'account-1',
      plan: 'free',
      currentPlan: null,
      subscriptionStartDate: null,
      billingCycleStart: null,
    };

    vi.spyOn(BillingAccount, 'findOne').mockReturnValue({
      select: vi.fn().mockResolvedValue({
        status: 'active',
        serviceAgreementAcceptedAt: new Date(),
        billingProfileStatus: 'declared',
        paymentMethodStatus: 'provider_verified',
        billingEmail: 'finance@example.test',
        legalName: 'Example Ltd',
        country: 'US',
        address: { line1: '1 Main St', city: 'Boston', postalCode: '02108' },
        declarationAcceptedAt: new Date(),
      }),
    });
    vi.spyOn(BillingSubscription, 'findOne').mockResolvedValue({
      tenantId: 'tenant-1',
      status: 'active',
      planId: 'plan-pro',
    });

    const result = await tenantSubscriptionService.applyPlanToTenant(tenant, 'pro', {
      source: 'provider_webhook',
    });

    expect(result.changed).toBe(true);
    expect(tenant.plan).toBe('pro');
    expect(tenant.currentPlan).toBe('plan-pro');
    expect(tenant.subscriptionStartDate).toBeInstanceOf(Date);
    expect(tenant.billingCycleStart).toBeInstanceOf(Date);
  });

  it('rejects paid entitlement without a verified commercial source', async () => {
    vi.spyOn(SubscriptionPlan, 'getPlanBySlug').mockResolvedValue({ _id: 'plan-promax', slug: 'promax' });

    await expect(tenantSubscriptionService.applyPlanToTenant({
      _id: 'tenant-1',
      accountId: 'account-1',
      plan: 'free',
      currentPlan: null,
    }, 'promax')).rejects.toMatchObject({ code: 'PaidPlanActivationDenied' });
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
        features: ['search.semantic'],
      },
      customLimits: {},
    };

    const plan = await tenantSubscriptionService.getPlanPayloadForTenant(tenant);
    const limits = await tenantSubscriptionService.getEffectiveLimits(tenant);

    expect(plan.slug).toBe('pro');
    expect(plan.name).toBe('Pro');
    expect(plan.features).toEqual(['search.semantic']);
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

  it('resolves data-defined plan slugs outside the original four defaults', async () => {
    vi.spyOn(SubscriptionPlan, 'getPlanBySlug').mockResolvedValue({
      _id: 'plan-agency',
      slug: 'agency-plus',
      name: 'Agency Plus',
      features: ['search.semantic'],
    });

    const plan = await tenantSubscriptionService.getPlanPayloadForTenant({
      plan: 'agency-plus',
      currentPlan: null,
    });

    expect(plan.slug).toBe('agency-plus');
    expect(plan.name).toBe('Agency Plus');
    expect(plan.features).toEqual(['search.semantic']);
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

  describe('syncEntitlementState', () => {
    const localRedisClient = require('../lib/localRedis');
    const apiUsageService = require('./apiUsageService');
    const edgeGatewaySyncService = require('./edgeGatewaySyncService');

    it('propagates an entitlement change to cache, quota gate and edge KV', async () => {
      const invalidate = vi.spyOn(localRedisClient, 'invalidateTenantCache').mockResolvedValue(true);
      const refresh = vi.spyOn(apiUsageService, 'refreshMonthlyLimitFlag').mockResolvedValue({
        limit: 5000,
        usage: 120,
        exceeded: false,
        periodKey: '2026-08',
      });
      const edgeSync = vi
        .spyOn(edgeGatewaySyncService, 'syncTenantConfig')
        .mockResolvedValue({ skipped: false, key: 'tenant:t1' });

      const result = await tenantSubscriptionService.syncEntitlementState('t1', {
        reason: 'subscription_updated',
      });

      expect(invalidate).toHaveBeenCalledWith('t1');
      expect(refresh).toHaveBeenCalledWith('t1');
      expect(edgeSync).toHaveBeenCalledWith({ tenantId: 't1' });
      expect(result).toMatchObject({
        tenantId: 't1',
        reason: 'subscription_updated',
        cacheInvalidated: true,
        limitFlag: { limit: 5000, usage: 120, exceeded: false, periodKey: '2026-08' },
      });
    });

    it('still writes the quota gate when edge KV sync fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(localRedisClient, 'invalidateTenantCache').mockResolvedValue(true);
      const refresh = vi.spyOn(apiUsageService, 'refreshMonthlyLimitFlag').mockResolvedValue({
        limit: 100,
        usage: 100,
        exceeded: true,
        periodKey: '2026-08',
      });
      vi.spyOn(edgeGatewaySyncService, 'syncTenantConfig').mockRejectedValue(new Error('KV down'));

      const result = await tenantSubscriptionService.syncEntitlementState('t2');

      expect(refresh).toHaveBeenCalledWith('t2');
      expect(result.limitFlag.exceeded).toBe(true);
      expect(result.edge).toMatchObject({ skipped: true, reason: 'edge_sync_failed' });
    });

    it('requires a tenantId', async () => {
      await expect(tenantSubscriptionService.syncEntitlementState(null)).rejects.toThrow(
        'tenantId is required'
      );
    });
  });
});
