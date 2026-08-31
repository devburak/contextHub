const { Tenant } = require('@contexthub/common');
const tenantSubscriptionService = require('./tenantSubscriptionService');

class InvitationPolicyService {
  async getTenantPlan(tenantId) {
    const tenant = await Tenant.findById(tenantId)
      .select('_id plan currentPlan status')
      .populate('currentPlan');

    if (!tenant) {
      const error = new Error('Tenant not found');
      error.code = 'TenantMissing';
      error.statusCode = 404;
      throw error;
    }

    return {
      tenant,
      planSlug: tenantSubscriptionService.getEffectivePlanSlug(tenant),
    };
  }

  async assertInvitationsAllowed(tenantId) {
    const { tenant, planSlug } = await this.getTenantPlan(tenantId);

    if (tenant.status !== 'active') {
      const error = new Error('Invitations are not available for an inactive tenant');
      error.code = 'TenantInvitationNotAllowed';
      error.statusCode = 403;
      throw error;
    }

    if (planSlug === 'free') {
      const error = new Error('Free tenants are single-user and cannot send or accept invitations');
      error.code = 'FreePlanInvitationNotAllowed';
      error.statusCode = 403;
      throw error;
    }

    return { tenant, planSlug };
  }
}

module.exports = new InvitationPolicyService();
