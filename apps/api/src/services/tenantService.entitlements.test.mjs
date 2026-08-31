import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Membership, Tenant } = require('@contexthub/common');
const tenantService = require('./tenantService');
const roleService = require('./roleService');

describe('TenantService entitlement summaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves normalized plan features when memberships refresh in Admin', async () => {
    const tenant = {
      _id: { toString: () => 'tenant-1' },
      name: 'Enterprise Tenant',
      slug: 'enterprise-tenant',
      plan: 'free',
      currentPlan: {
        _id: 'plan-enterprise',
        slug: 'enterprise',
        name: 'Enterprise',
        features: ['search.semantic', 'content.related'],
      },
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const membership = {
      _id: { toString: () => 'membership-1' },
      tenantId: tenant,
      role: 'owner',
      status: 'active',
    };
    const query = {
      populate: vi.fn().mockReturnThis(),
      sort: vi.fn().mockResolvedValue([membership]),
    };
    vi.spyOn(Membership, 'find').mockReturnValue(query);
    vi.spyOn(Membership, 'countDocuments').mockResolvedValue(1);
    vi.spyOn(roleService, 'ensureRoleReference').mockResolvedValue({
      role: { _id: 'role-owner', key: 'owner', name: 'Owner' },
      permissions: ['semanticSearch.query'],
    });
    vi.spyOn(roleService, 'formatRole').mockReturnValue({ id: 'role-owner', key: 'owner' });

    const memberships = await tenantService.listUserTenants('user-1');

    expect(memberships[0].tenant).toMatchObject({
      plan: 'enterprise',
      planName: 'Enterprise',
      currentPlan: expect.objectContaining({ slug: 'enterprise' }),
      features: ['search.semantic', 'content.related'],
    });
  });

  it('does not count a paid tenant as the owner free-tenant allowance', async () => {
    const membershipQuery = {
      select: vi.fn().mockResolvedValue([{ tenantId: 'paid-tenant' }]),
    };
    const tenantQuery = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockResolvedValue([{
        plan: 'free',
        currentPlan: { slug: 'pro' },
      }]),
    };
    vi.spyOn(Membership, 'find').mockReturnValue(membershipQuery);
    vi.spyOn(Tenant, 'find').mockReturnValue(tenantQuery);

    await expect(tenantService.hasOwnedFreeTenant('user-1')).resolves.toBe(false);
    expect(Membership.find).toHaveBeenCalledWith({
      userId: 'user-1',
      role: 'owner',
      status: 'active',
    });
  });

  it('counts an active Free tenant against the owner allowance', async () => {
    const membershipQuery = {
      select: vi.fn().mockResolvedValue([{ tenantId: 'free-tenant' }]),
    };
    const tenantQuery = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockResolvedValue([{ plan: 'free', currentPlan: null }]),
    };
    vi.spyOn(Membership, 'find').mockReturnValue(membershipQuery);
    vi.spyOn(Tenant, 'find').mockReturnValue(tenantQuery);

    await expect(tenantService.hasOwnedFreeTenant('user-1')).resolves.toBe(true);
    expect(Tenant.find).toHaveBeenCalledWith({
      _id: { $in: ['free-tenant'] },
      status: { $nin: ['deletion_pending', 'deleted'] },
    });
  });
});
