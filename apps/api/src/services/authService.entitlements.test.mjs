import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { Membership, User } = require('@contexthub/common');
const AuthService = require('./authService');
const roleService = require('./roleService');

describe('AuthService entitlement memberships', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns normalized features from currentPlan when the legacy plan string is stale', async () => {
    const enterprisePlan = {
      _id: 'plan-enterprise',
      slug: 'enterprise',
      name: 'Enterprise',
      features: ['search.semantic', 'content.related'],
    };
    const tenant = {
      _id: { toString: () => 'tenant-1' },
      name: 'Legacy Enterprise Tenant',
      slug: 'legacy-enterprise',
      plan: 'free',
      currentPlan: enterprisePlan,
      status: 'active',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const membership = {
      _id: { toString: () => 'membership-1' },
      tenantId: tenant,
      role: 'owner',
      status: 'active',
    };
    const membershipQuery = {
      populate: vi.fn().mockResolvedValue([membership]),
    };
    vi.spyOn(Membership, 'find').mockReturnValue(membershipQuery);
    vi.spyOn(User, 'findById').mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: { toString: () => 'user-1' },
        email: 'owner@example.test',
        firstName: 'Owner',
        lastName: 'User',
        status: 'active',
      }),
    });
    vi.spyOn(roleService, 'ensureRoleReference').mockResolvedValue({
      role: { _id: 'role-owner', key: 'owner', name: 'Owner' },
      permissions: ['semanticSearch.query'],
    });
    vi.spyOn(roleService, 'formatRole').mockReturnValue({ id: 'role-owner', key: 'owner' });

    const state = await new AuthService({}).getSessionState('user-1', { tenantId: 'tenant-1' });

    expect(membershipQuery.populate).toHaveBeenCalledWith(expect.objectContaining({
      path: 'tenantId',
      select: expect.stringContaining('currentPlan'),
      populate: { path: 'currentPlan' },
    }));
    expect(state.activeMembership.tenant).toMatchObject({
      plan: 'enterprise',
      planName: 'Enterprise',
      currentPlan: expect.objectContaining({ slug: 'enterprise' }),
      features: ['search.semantic', 'content.related'],
    });
  });
});
