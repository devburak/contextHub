const { BillingSubscription, Tenant } = require('@contexthub/common');
const tenantSubscriptionService = require('../tenantSubscriptionService');

async function reconcile(now = new Date()) {
  const overdue = await BillingSubscription.find({
    status: 'past_due',
    gracePeriodEndsAt: { $ne: null, $lte: now },
  });
  const expirationDays = Math.max(1, Number(process.env.BILLING_EXPIRATION_DAYS || 14));
  const results = { restricted: 0, expired: 0 };

  for (const subscription of overdue) {
    const tenant = await Tenant.findById(subscription.tenantId);
    if (!tenant) continue;
    results.restricted += 1;
    const expirationAt = new Date(subscription.gracePeriodEndsAt.getTime() + expirationDays * 86400000);
    if (expirationAt <= now) {
      subscription.status = 'expired';
      await tenantSubscriptionService.applyPlanToTenant(tenant, 'free');
      results.expired += 1;
    }
    await Promise.all([tenant.save(), subscription.save()]);
    await tenantSubscriptionService.syncEntitlementState(tenant._id, { reason: 'billing_lifecycle_reconcile' });
  }
  return results;
}

module.exports = { reconcile };
