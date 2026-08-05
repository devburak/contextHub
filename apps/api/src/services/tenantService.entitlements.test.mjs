import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Membership } = require('@contexthub/common');
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
});
