const {
  Account,
  BillingAccount,
  Tenant,
} = require('@contexthub/common');

function accountSlugForTenant(tenant) {
  return `${tenant.slug}-account`;
}

async function createForTenant(tenant, ownerUserId, options = {}) {
  if (!tenant?._id) throw new Error('Persisted tenant is required');
  if (!ownerUserId) throw new Error('Account owner is required');

  if (tenant.accountId) {
    const account = await Account.findById(tenant.accountId);
    if (account) await removeLegacyCommercialFields(account._id);
    return account;
  }

  const existing = await Account.findOne({ slug: accountSlugForTenant(tenant) });
  const account = existing || await Account.create({
    name: tenant.name,
    slug: accountSlugForTenant(tenant),
    ownerUserId,
  });
  await removeLegacyCommercialFields(account._id);

  if (String(tenant.accountId || '') !== String(account._id)) {
    tenant.accountId = account._id;
    await tenant.save();
  }

  await BillingAccount.findOneAndUpdate(
    { accountId: account._id },
    {
      $setOnInsert: {
        provider: options.provider || 'manual',
        status: 'pending',
        billingEmail: options.billingEmail || '',
        legalName: tenant.name,
        currency: options.currency || 'USD',
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return account;
}

async function removeLegacyCommercialFields(accountId) {
  await Account.collection.updateOne(
    { _id: accountId },
    { $unset: {
      plan: '',
      currentPlan: '',
      subscriptionStartDate: '',
      billingCycleStart: '',
      tenantLimit: '',
      customLimits: '',
      addons: '',
    } }
  );
}

async function listTenants(accountId) {
  return Tenant.find({ accountId }).select('_id name slug status accountId');
}

module.exports = {
  accountSlugForTenant,
  createForTenant,
  listTenants,
};
