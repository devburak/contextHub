const { Tenant, Membership, rbac } = require('@contexthub/common');
const roleService = require('./roleService');

const { ROLE_KEYS } = rbac;

class TenantService {
  #slugify(value) {
    return value
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async generateUniqueSlug(base) {
    const normalized = this.#slugify(base);
    let candidate = normalized;
    let suffix = 1;

    while (await Tenant.exists({ slug: candidate })) {
      candidate = `${normalized}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  async createTenant({ name, slug, plan = 'free' }, ownerId) {
    if (!name) {
      throw new Error('Tenant name is required');
    }

    let finalSlug;
    if (slug?.trim()) {
      finalSlug = this.#slugify(slug);
      if (!finalSlug) {
        finalSlug = await this.generateUniqueSlug(name);
      }
      if (await Tenant.exists({ slug: finalSlug })) {
        throw new Error('Tenant slug already exists');
      }
    } else {
      finalSlug = await this.generateUniqueSlug(name);
    }

    const tenant = new Tenant({
      name,
      slug: finalSlug,
      plan,
      status: 'active',
      createdBy: ownerId
    });
    await tenant.save();

    const ownerRole = await roleService.resolveRole({ tenantId: tenant._id, roleKey: ROLE_KEYS.OWNER })
      || await roleService.resolveRole({ tenantId: null, roleKey: ROLE_KEYS.OWNER });

    const membership = new Membership({
      tenantId: tenant._id,
      userId: ownerId,
      role: ownerRole?.key || ROLE_KEYS.OWNER,
      roleId: ownerRole?._id || null,
      status: 'active',
      createdBy: ownerId
    });
    await membership.save();

    return { tenant, membership };
  }

  async listUserTenants(userId) {
    const memberships = await Membership.find({ userId, status: 'active' })
      .populate('tenantId', 'name slug plan status createdAt')
      .sort({ createdAt: -1 });

    return Promise.all(memberships.map(async (membership) => {
      const tenantDoc = membership.tenantId;
      const tenantId = tenantDoc?._id?.toString() || membership.tenantId?.toString();
      const { role: roleDoc, permissions } = await roleService.ensureRoleReference(
        membership,
        tenantId
      );

      return {
        id: membership._id.toString(),
        tenantId,
        tenant: tenantDoc
          ? {
              id: tenantDoc._id.toString(),
              name: tenantDoc.name,
              slug: tenantDoc.slug,
              plan: tenantDoc.plan,
              status: tenantDoc.status,
              createdAt: tenantDoc.createdAt
            }
          : null,
        role: roleDoc?.key || membership.role,
        roleMeta: roleService.formatRole(roleDoc),
        permissions,
        status: membership.status
      };
    }));
  }
}

module.exports = new TenantService();
