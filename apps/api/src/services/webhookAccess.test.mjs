import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { canDeliverWebhook, visibleWebhooks } = require('./webhookAccess');
const { Membership, User, Tenant, rbac } = require('@contexthub/common');
const roleService = require('./roleService');
let user, membership, tenant, role, permissions;
const hook = { tenantId: 'tenant-a', scope: 'personal', ownerUserId: 'user-a' };
beforeEach(() => {
  user = { status: 'active' }; tenant = { status: 'active' };
  permissions = [rbac.PERMISSIONS.TENANTS_MANAGE]; role = { key: 'admin' };
  membership = { role: 'admin', getEffectivePermissions: () => permissions };
  vi.spyOn(Tenant, 'findById').mockImplementation(() => ({ select: () => ({ lean: async () => tenant }) }));
  vi.spyOn(User, 'findById').mockImplementation(() => ({ select: () => ({ lean: async () => user }) }));
  vi.spyOn(Membership, 'findOne').mockImplementation(async () => membership);
  vi.spyOn(roleService, 'resolveRole').mockImplementation(async () => role);
});
afterEach(() => vi.restoreAllMocks());
describe('personal notification recipient authorization', () => {
  it('checks the exact owner membership in the hook tenant', async () => {
    expect(await canDeliverWebhook(hook)).toBe(true);
    expect(Membership.findOne).toHaveBeenCalledWith({ tenantId: 'tenant-a', userId: 'user-a', status: 'active' });
    expect(User.findById).toHaveBeenCalledWith('user-a');
  });
  it.each(['membership', 'account', 'permission', 'role', 'tenant', 'owner', 'role tenant'])('fails closed after losing %s', async (lost) => {
    if (lost === 'membership') membership = null;
    if (lost === 'account') user.status = 'suspended';
    if (lost === 'permission') permissions = [];
    if (lost === 'role') role = null;
    if (lost === 'role tenant') role.tenantId = 'tenant-b';
    if (lost === 'tenant') tenant.status = 'suspended';
    expect(await canDeliverWebhook(lost === 'owner' ? { ...hook, ownerUserId: null } : hook)).toBe(false);
  });
  it('retains shared subscriptions without inventing a personal owner', async () => {
    expect(await canDeliverWebhook({ tenantId: 'tenant-a' })).toBe(true);
    expect(Membership.findOne).not.toHaveBeenCalled();
  });
  it('does not include other personal owners in the visibility filter', () => {
    expect(visibleWebhooks('user-a').$or).toEqual([{ scope: { $ne: 'personal' } }, { scope: 'personal', ownerUserId: 'user-a' }]);
    expect(visibleWebhooks().$or).toEqual([{ scope: { $ne: 'personal' } }]);
  });
});
