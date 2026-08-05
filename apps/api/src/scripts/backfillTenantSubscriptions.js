const path = require('path');
const dotenv = require('dotenv');
const { database, Tenant } = require('@contexthub/common');
const tenantSubscriptionService = require('../services/tenantSubscriptionService');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function readFlag(argv, flagName) {
  const match = argv.find((arg) => arg.startsWith(`${flagName}=`));
  return match ? match.slice(flagName.length + 1) : null;
}

function parseNumberFlag(argv, flagName) {
  const value = readFlag(argv, flagName);
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${flagName}: ${value}`);
  }
  return parsed;
}

function parseArgs(argv = []) {
  return {
    tenantSlug: readFlag(argv, '--tenant-slug') || process.env.RECOVERY_TENANT_SLUG || 'keskorgtr',
    planSlug: readFlag(argv, '--plan') || null,
    dryRun: argv.includes('--dry-run'),
    applyRecoveryOverrides: !argv.includes('--skip-recovery-overrides'),
    recoveryCustomLimits: {
      userLimit: parseNumberFlag(argv, '--user-limit'),
      ownerLimit: parseNumberFlag(argv, '--owner-limit'),
      storageLimit: parseNumberFlag(argv, '--storage-limit'),
      monthlyRequestLimit: parseNumberFlag(argv, '--monthly-request-limit'),
    },
  };
}

function resolveTargetPlanSlug(tenant, requestedPlanSlug = null) {
  return requestedPlanSlug || tenant?.currentPlan?.slug || tenant?.plan || 'free';
}

async function backfillTenantSubscriptions(options = {}) {
  const args = {
    ...parseArgs(process.argv.slice(2)),
    ...options,
  };

  if (!args.tenantSlug) {
    throw new Error('tenant slug is required');
  }

  await database.connectDB();

  try {
    const tenant = await Tenant.findOne({ slug: args.tenantSlug }).populate('currentPlan');
    if (!tenant) {
      throw new Error(`Tenant not found for slug: ${args.tenantSlug}`);
    }

    // currentPlan is the canonical reference. Prefer it over the legacy mirrored
    // string so a stale `plan=free` value cannot downgrade a paid tenant.
    const targetPlanSlug = resolveTargetPlanSlug(tenant, args.planSlug);
    const planResult = await tenantSubscriptionService.applyPlanToTenant(tenant, targetPlanSlug);

    let limitsChanged = false;
    if (args.applyRecoveryOverrides) {
      const recoveryCustomLimits = tenantSubscriptionService.buildRecoveryCustomLimits(
        args.recoveryCustomLimits
      );
      limitsChanged = tenantSubscriptionService.applyCustomLimits(tenant, recoveryCustomLimits);
    }

    const changed = planResult.changed || limitsChanged;

    if (changed && !args.dryRun) {
      await tenant.save();
      await tenantSubscriptionService.syncEntitlementState(tenant._id, {
        reason: 'subscription_backfill',
      });
    }

    const summary = {
      tenantId: tenant._id.toString(),
      slug: tenant.slug,
      plan: tenant.plan,
      currentPlan: tenantSubscriptionService.getPlanId(tenant.currentPlan),
      customLimits: tenant.customLimits,
      changed,
      dryRun: args.dryRun,
    };

    console.log(`\n${args.dryRun ? '🧪' : '✅'} Tenant subscription backfill tamamlandi.`);
    console.log(`  Tenant: ${tenant.slug}`);
    console.log(`  Plan: ${summary.plan}`);
    console.log(`  Current plan ref: ${summary.currentPlan || 'null (free fallback)'}`);
    console.log(`  Custom limits: ${JSON.stringify(summary.customLimits)}`);

    return summary;
  } finally {
    await database.disconnectDB();
  }
}

if (require.main === module) {
  backfillTenantSubscriptions().catch((error) => {
    console.error('\n❌ Tenant subscription backfill basarisiz:', error);
    process.exit(1);
  });
}

module.exports = backfillTenantSubscriptions;
module.exports.resolveTargetPlanSlug = resolveTargetPlanSlug;
