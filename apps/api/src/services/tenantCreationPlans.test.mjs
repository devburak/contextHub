import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Tenant, Membership, User, SubscriptionPlan, PlanPrice, ApiToken } = require('@contexthub/common');
const service = require('./tenantService');
const subscriptions = require('./tenantSubscriptionService');
const accounts = require('./accountService');
const roles = require('./roleService');
const edge = require('./edgeGatewaySyncService');
const { authenticate } = require('../middleware/auth');

const ownerId = '507f1f77bcf86cd799439011';
const query = (result) => ({ select: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(result) });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('tenant creation plan selection', () => {
  it('offers only configured paid plans and preserves the Free allowance', async () => {
    vi.stubEnv('ACCOUNT_BILLING_ENABLED', 'true');
    vi.stubEnv('BILLING_ENABLED_PROVIDERS', 'paddle');
    vi.spyOn(service, 'hasOwnedFreeTenant').mockResolvedValue(true);
    vi.spyOn(SubscriptionPlan, 'find').mockReturnValue(query([
      { _id: 'free', slug: 'free', name: 'Free' },
      { _id: 'pro', slug: 'pro', name: 'Pro' },
      { _id: 'promax', slug: 'promax', name: 'Pro Max' },
      { _id: 'enterprise', slug: 'enterprise', name: 'Enterprise' },
    ]));
    vi.spyOn(PlanPrice, 'find').mockReturnValue(query([{ planId: 'pro' }, { planId: 'enterprise' }]));
    const options = await service.getCreationOptions(ownerId);
    expect(options.plans.map(({ slug, available }) => [slug, available])).toEqual([
      ['free', false], ['pro', true], ['promax', false], ['enterprise', false],
    ]);
    expect(PlanPrice.find).toHaveBeenCalledWith(expect.objectContaining({
      active: true, provider: { $in: ['paddle'] }, externalPriceId: { $nin: [null, ''] },
    }));
  });

  it('does not offer paid creation when account billing is disabled', async () => {
    vi.stubEnv('ACCOUNT_BILLING_ENABLED', 'false');
    vi.spyOn(service, 'hasOwnedFreeTenant').mockResolvedValue(false);
    vi.spyOn(SubscriptionPlan, 'find').mockReturnValue(query([{ _id: 'pro', slug: 'pro', name: 'Pro' }]));
    const prices = vi.spyOn(PlanPrice, 'find');
    expect((await service.getCreationOptions(ownerId)).plans[0].available).toBe(false);
    expect(prices).not.toHaveBeenCalled();
  });

  it('rejects forged, unavailable and Enterprise plan selections before writing', async () => {
    vi.spyOn(service, 'getCreationOptions').mockResolvedValue({ plans: [{ slug: 'pro', available: false }] });
    const save = vi.spyOn(Tenant.prototype, 'save');
    for (const requestedPlanSlug of ['unknown', 'pro', 'enterprise']) {
      await expect(service.createTenant({ name: 'Acme', requestedPlanSlug }, ownerId))
        .rejects.toMatchObject({ code: 'PlanUnavailable' });
    }
    expect(save).not.toHaveBeenCalled();
  });

  it('still rejects a second Free tenant', async () => {
    vi.spyOn(service, 'hasOwnedFreeTenant').mockResolvedValue(true);
    const save = vi.spyOn(Tenant.prototype, 'save');
    await expect(service.createTenant({ name: 'Acme' }, ownerId)).rejects.toMatchObject({ code: 'FreeTenantLimit' });
    expect(save).not.toHaveBeenCalled();
  });

  it('creates a paid selection with no usable entitlements despite an existing Free tenant', async () => {
    vi.spyOn(service, 'hasOwnedFreeTenant').mockResolvedValue(true);
    vi.spyOn(service, 'getCreationOptions').mockResolvedValue({ plans: [{ slug: 'pro', available: true }] });
    vi.spyOn(Tenant, 'exists').mockResolvedValue(false);
    vi.spyOn(Tenant.prototype, 'save').mockImplementation(async function () { return this; });
    vi.spyOn(Membership.prototype, 'save').mockImplementation(async function () { return this; });
    vi.spyOn(User, 'findById').mockReturnValue({ select: vi.fn().mockResolvedValue({ email: 'owner@example.test' }) });
    vi.spyOn(accounts, 'createForTenant').mockResolvedValue({});
    vi.spyOn(roles, 'resolveRole').mockResolvedValue(null);
    vi.spyOn(edge, 'syncTenantBundle').mockResolvedValue({});
    vi.stubEnv('HOSTED_OPERATIONS_NOTIFICATIONS_ENABLED', 'false');
    const apply = vi.spyOn(subscriptions, 'applyPlanToTenant');
    const { tenant, membership } = await service.createTenant({ name: 'Acme', slug: 'acme', requestedPlanSlug: 'pro' }, ownerId);
    expect(tenant.status).toBe('pending_payment');
    expect(tenant.requestedPlanSlug).toBe('pro');
    expect(tenant.plan).toBe('free');
    expect(tenant.currentPlan).toBeNull();
    expect(apply).toHaveBeenCalledWith(tenant, 'free');
    expect(membership.role).toBe('owner');
    expect(edge.syncTenantBundle).toHaveBeenCalledWith(expect.objectContaining({ tenant }));
  });
});

describe('unpaid tenant access', () => {
  it.each(['/api/contents', '/api/billing/overview'])('rejects API tokens for an unpaid tenant on %s', async (url) => {
    vi.spyOn(ApiToken, 'findOne').mockResolvedValue({
      _id: ownerId, tenantId: ownerId, lastAuditAt: new Date(), save: vi.fn().mockResolvedValue(),
    });
    vi.spyOn(Tenant, 'findById').mockReturnValue(query({ status: 'pending_payment' }));
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
    await authenticate({ headers: { authorization: 'Bearer ctx_test' }, url, method: 'GET' }, reply);
    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'TenantUnavailable' }));
  });
});
