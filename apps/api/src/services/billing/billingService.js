const {
  Account,
  BillingAccount,
  BillingInvoice,
  BillingSubscription,
  Media,
  Membership,
  PlanPrice,
  QuotaAlert,
  Tenant,
} = require('@contexthub/common');
const { getBillingProvider, isAccountBillingEnabled } = require('../../lib/billingConfig');
const paddleProvider = require('./paddleProvider');
const tenantSubscriptionService = require('../tenantSubscriptionService');
const apiUsageService = require('../apiUsageService');

function getProvider() {
  const provider = getBillingProvider();
  if (provider === 'paddle') return paddleProvider;
  throw new Error(`Self-service billing provider is not available: ${provider}`);
}

async function getAccountForTenant(tenantId) {
  if (!isAccountBillingEnabled()) {
    const error = new Error('Account billing is not enabled for this environment');
    error.code = 'BillingDisabled';
    throw error;
  }
  const tenant = await Tenant.findById(tenantId).select('_id accountId name slug plan currentPlan customLimits').populate('currentPlan');
  if (!tenant) throw new Error('Tenant not found');
  if (!tenant.accountId) {
    const error = new Error('Billing account migration is required for this tenant');
    error.code = 'AccountMigrationRequired';
    throw error;
  }
  const account = await Account.findById(tenant.accountId);
  if (!account) throw new Error('Account not found');
  return { tenant, account };
}

function serializePrice(price) {
  return {
    id: String(price._id),
    key: price.key,
    plan: price.planId ? {
      id: String(price.planId._id),
      slug: price.planId.slug,
      name: price.planId.name,
      description: price.planId.description,
      marketing: price.planId.marketing || {},
      capabilities: price.planId.capabilities || [],
      limits: {
        users: price.planId.userLimit,
        owners: price.planId.ownerLimit,
        storage: price.planId.storageLimit,
        requests: price.planId.monthlyRequestLimit,
      },
    } : null,
    provider: price.provider,
    interval: price.interval,
    currency: price.currency,
    amountMinor: price.amountMinor,
    checkoutReady: Boolean(price.externalPriceId),
  };
}

async function getOverview(tenantId) {
  const { tenant, account } = await getAccountForTenant(tenantId);
  const [billingAccount, subscription, invoices, prices, alerts, limits, userCount, ownerCount, storageRows, requestCount] = await Promise.all([
    BillingAccount.findOne({ accountId: account._id }).lean(),
    BillingSubscription.findOne({ tenantId: tenant._id }).populate('planId planPriceId').lean(),
    BillingInvoice.find({ tenantId: tenant._id }).sort({ billedAt: -1, createdAt: -1 }).limit(24).lean(),
    PlanPrice.find({ active: true, provider: 'paddle' }).populate('planId').sort({ amountMinor: 1 }).lean(),
    QuotaAlert.find({ tenantId: tenant._id }).sort({ createdAt: -1 }).limit(12).lean(),
    tenantSubscriptionService.getEffectiveLimits(tenant),
    Membership.countDocuments({ tenantId: tenant._id, status: { $in: ['active', 'pending'] } }),
    Membership.countDocuments({ tenantId: tenant._id, role: 'owner', status: { $in: ['active', 'pending'] } }),
    Media.aggregate([
      { $match: { tenantId: tenant._id, status: { $ne: 'deleted' } } },
      { $project: { total: { $add: [
        { $ifNull: ['$size', 0] },
        { $sum: { $map: { input: { $ifNull: ['$variants', []] }, as: 'variant', in: { $ifNull: ['$$variant.size', 0] } } } },
      ] } } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]),
    apiUsageService.getMonthlyUsage(tenant._id).catch(() => 0),
  ]);

  const metric = (usage, limit) => ({
    usage,
    limit,
    unlimited: limit === null || limit === -1,
    percentage: limit === null || limit === -1 || limit <= 0 ? 0 : Math.min(100, Math.round((usage / limit) * 100)),
  });

  return {
    tenant: {
      id: String(tenant._id),
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.currentPlan ? {
        slug: tenant.currentPlan.slug,
        name: tenant.currentPlan.name,
      } : { slug: tenant.plan || 'free', name: tenant.plan === 'free' ? 'Free' : tenant.plan },
    },
    account: {
      id: String(account._id),
      name: account.name,
      status: account.status,
    },
    billingAccount: billingAccount ? {
      provider: billingAccount.provider,
      status: billingAccount.status,
      billingEmail: billingAccount.billingEmail,
      legalName: billingAccount.legalName,
      country: billingAccount.country,
      currency: billingAccount.currency,
      hasProviderCustomer: Boolean(billingAccount.externalCustomerId),
    } : null,
    subscription: subscription ? {
      id: String(subscription._id),
      provider: subscription.provider,
      status: subscription.status,
      interval: subscription.interval,
      currency: subscription.currency,
      amountMinor: subscription.amountMinor,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      gracePeriodEndsAt: subscription.gracePeriodEndsAt,
      plan: subscription.planId ? { slug: subscription.planId.slug, name: subscription.planId.name } : null,
    } : null,
    prices: prices.map(serializePrice),
    invoices: invoices.map((invoice) => ({
      id: String(invoice._id),
      number: invoice.invoiceNumber,
      status: invoice.status,
      currency: invoice.currency,
      totalMinor: invoice.totalMinor,
      billedAt: invoice.billedAt,
      paidAt: invoice.paidAt,
      documentUrl: invoice.documentUrl,
    })),
    quotaAlerts: alerts.map((alert) => ({
      id: String(alert._id),
      metric: alert.metric,
      threshold: alert.threshold,
      usage: alert.usage,
      limit: alert.limit,
      periodKey: alert.periodKey,
      createdAt: alert.createdAt,
      readAt: alert.readAt,
    })),
    usage: {
      users: metric(userCount, limits.userLimit),
      owners: metric(ownerCount, limits.ownerLimit),
      storage: metric(storageRows[0]?.total || 0, limits.storageLimit),
      requests: metric(requestCount || 0, limits.monthlyRequestLimit),
    },
  };
}

async function createCheckout(tenantId, priceKey) {
  const { tenant, account } = await getAccountForTenant(tenantId);
  const activeSubscription = await BillingSubscription.findOne({
    tenantId: tenant._id,
    status: { $in: ['trialing', 'active', 'past_due', 'paused'] },
  });
  if (activeSubscription) {
    const error = new Error('Use the customer portal to change an active subscription');
    error.code = 'PortalRequired';
    throw error;
  }

  const planPrice = await PlanPrice.findOne({ key: priceKey, active: true }).populate('planId');
  if (!planPrice || planPrice.provider !== getBillingProvider()) throw new Error('Plan price is not available');
  if (!planPrice.externalPriceId) {
    const error = new Error('This plan price is not configured for checkout');
    error.code = 'CheckoutNotConfigured';
    throw error;
  }

  await BillingAccount.findOneAndUpdate(
    { accountId: account._id },
    { $set: { provider: planPrice.provider }, $setOnInsert: { accountId: account._id } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return getProvider().createCheckout({ tenant, account, planPrice });
}

async function createPortalSession(tenantId) {
  const { tenant, account } = await getAccountForTenant(tenantId);
  const [billingAccount, subscription] = await Promise.all([
    BillingAccount.findOne({ accountId: account._id }),
    BillingSubscription.findOne({ tenantId: tenant._id }),
  ]);
  if (!billingAccount?.externalCustomerId) {
    const error = new Error('Customer portal is not available before the first completed checkout');
    error.code = 'PortalUnavailable';
    throw error;
  }
  return getProvider().createPortalSession({
    externalCustomerId: billingAccount.externalCustomerId,
    externalSubscriptionId: subscription?.externalSubscriptionId || null,
  });
}

module.exports = {
  createCheckout,
  createPortalSession,
  getAccountForTenant,
  getOverview,
};
