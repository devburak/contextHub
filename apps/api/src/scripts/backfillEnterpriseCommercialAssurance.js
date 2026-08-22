const path = require('path');
const dotenv = require('dotenv');
const {
  BillingAccount,
  Membership,
  SubscriptionPlan,
  Tenant,
  database,
} = require('@contexthub/common');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const LEGACY_ENTERPRISE_AGREEMENT_VERSION = 'enterprise-legacy-contract-v1';

function parseArgs(argv = process.argv.slice(2)) {
  return {
    apply: argv.includes('--apply'),
    tenantSlug: argv.find((arg) => arg.startsWith('--tenant-slug='))?.split('=')[1] || null,
  };
}

function buildEnterpriseAssuranceUpdate(tenant, ownerUserId, now = new Date()) {
  return {
    billingProfileStatus: 'legacy_enterprise',
    paymentMethodStatus: 'enterprise_contract',
    serviceAgreementVersion: LEGACY_ENTERPRISE_AGREEMENT_VERSION,
    serviceAgreementAcceptedAt: tenant.subscriptionStartDate || tenant.createdAt || now,
    serviceAgreementAcceptedBy: ownerUserId || null,
    status: 'active',
  };
}

async function backfillEnterpriseCommercialAssurance(options = {}) {
  const args = { ...parseArgs(), ...options };
  await database.connectDB();

  try {
    const enterprisePlan = await SubscriptionPlan.findOne({ slug: 'enterprise' }).select('_id');
    const query = {
      $or: [
        { plan: 'enterprise' },
        ...(enterprisePlan ? [{ currentPlan: enterprisePlan._id }] : []),
      ],
    };
    if (args.tenantSlug) query.slug = args.tenantSlug;

    const tenants = await Tenant.find(query).sort({ createdAt: 1 });
    const summary = { dryRun: !args.apply, scanned: tenants.length, updated: 0, skipped: [], tenants: [] };

    for (const tenant of tenants) {
      if (!tenant.accountId) {
        summary.skipped.push({ tenantId: String(tenant._id), slug: tenant.slug, reason: 'account_not_found' });
        continue;
      }
      const owner = await Membership.findOne({
        tenantId: tenant._id,
        role: 'owner',
        status: 'active',
      }).sort({ createdAt: 1 }).select('userId');
      const update = buildEnterpriseAssuranceUpdate(tenant, owner?.userId);

      if (args.apply) {
        await BillingAccount.findOneAndUpdate(
          { accountId: tenant.accountId },
          { $set: update, $setOnInsert: { accountId: tenant.accountId, provider: 'manual' } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        summary.updated += 1;
      }
      summary.tenants.push({
        tenantId: String(tenant._id),
        slug: tenant.slug,
        accountId: String(tenant.accountId),
        agreementVersion: update.serviceAgreementVersion,
        acceptedAt: update.serviceAgreementAcceptedAt,
      });
    }

    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    await database.disconnectDB();
  }
}

if (require.main === module) {
  backfillEnterpriseCommercialAssurance().catch((error) => {
    console.error('[EnterpriseCommercialAssuranceBackfill] failed:', error);
    process.exitCode = 1;
  });
}

module.exports = backfillEnterpriseCommercialAssurance;
module.exports.LEGACY_ENTERPRISE_AGREEMENT_VERSION = LEGACY_ENTERPRISE_AGREEMENT_VERSION;
module.exports.buildEnterpriseAssuranceUpdate = buildEnterpriseAssuranceUpdate;
module.exports.parseArgs = parseArgs;
