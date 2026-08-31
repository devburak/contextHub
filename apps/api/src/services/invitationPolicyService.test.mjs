import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Tenant } = require('@contexthub/common');
const invitationPolicyService = require('./invitationPolicyService');

function mockTenant(tenant) {
  const query = {
    select: vi.fn().mockReturnThis(),
    populate: vi.fn().mockResolvedValue(tenant),
  };
  vi.spyOn(Tenant, 'findById').mockReturnValue(query);
  return query;
}

describe('invitationPolicyService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects invitations for free tenants even when a stale plan reference is absent', async () => {
    mockTenant({ _id: 'tenant-free', plan: 'free', currentPlan: null, status: 'active' });

    await expect(invitationPolicyService.assertInvitationsAllowed('tenant-free'))
      .rejects.toMatchObject({ code: 'FreePlanInvitationNotAllowed', statusCode: 403 });
  });

  it('uses the populated current plan instead of a stale free slug', async () => {
    mockTenant({
      _id: 'tenant-pro',
      plan: 'free',
      currentPlan: { _id: 'plan-pro', slug: 'pro' },
      status: 'active',
    });

    await expect(invitationPolicyService.assertInvitationsAllowed('tenant-pro'))
      .resolves.toMatchObject({ planSlug: 'pro' });
  });

  it('fails closed when the tenant cannot be resolved', async () => {
    mockTenant(null);

    await expect(invitationPolicyService.assertInvitationsAllowed('missing'))
      .rejects.toMatchObject({ code: 'TenantMissing', statusCode: 404 });
  });
});
