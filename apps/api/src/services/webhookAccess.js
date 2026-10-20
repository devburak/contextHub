const { Membership, User, Tenant, rbac } = require('@contexthub/common');
const roleService = require('./roleService');
const { sameWebhookTenant } = require('../lib/webhookTenant');

function visibleWebhooks(userId) {
  return { $or: [
    { scope: { $ne: 'personal' } },
    ...(userId ? [{ scope: 'personal', ownerUserId: String(userId) }] : [])
  ] };
}

async function canDeliverWebhook(hook) {
  const tenant = await Tenant.findById(hook.tenantId).select('status').lean();
  if (tenant?.status !== 'active') return false;
  if (hook.scope !== 'personal') return true;
  if (!hook.ownerUserId) return false;
  const [user, membership] = await Promise.all([
    User.findById(hook.ownerUserId).select('status').lean(),
    Membership.findOne({ tenantId: hook.tenantId, userId: hook.ownerUserId, status: 'active' })
  ]);
  if (user?.status !== 'active' || !membership) return false;
  // Delivery is read-only: never repair a missing role by assigning a fallback role.
  const role = await roleService.resolveRole({ tenantId: hook.tenantId, roleId: membership.roleId, roleKey: membership.role });
  if (!role || (role.tenantId != null && !sameWebhookTenant(role.tenantId, hook.tenantId))) return false;
  const permissions = membership.getEffectivePermissions(role);
  return role.key === 'owner'
    || rbac.expandPermissions(permissions || []).includes(rbac.PERMISSIONS.TENANTS_MANAGE);
}

module.exports = { visibleWebhooks, canDeliverWebhook };
