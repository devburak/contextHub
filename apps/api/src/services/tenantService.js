const { Tenant, Membership } = require('@contexthub/common');

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

    const membership = new Membership({
      tenantId: tenant._id,
      userId: ownerId,
      role: 'owner',
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

    return memberships.map((membership) => ({
      id: membership._id.toString(),
      tenantId: membership.tenantId?._id?.toString(),
      tenant: membership.tenantId
        ? {
            id: membership.tenantId._id.toString(),
            name: membership.tenantId.name,
            slug: membership.tenantId.slug,
            plan: membership.tenantId.plan,
            status: membership.tenantId.status,
            createdAt: membership.tenantId.createdAt
          }
        : null,
      role: membership.role,
      status: membership.status
    }));
  }
}

module.exports = new TenantService();
