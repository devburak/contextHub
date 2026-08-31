const path = require('path');
const dotenv = require('dotenv');
const {
  database,
  Tenant,
  Membership,
  User,
} = require('@contexthub/common');
const accountService = require('../services/accountService');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function parseArgs(argv = process.argv.slice(2)) {
  return {
    apply: argv.includes('--apply'),
    tenantSlug: argv.find((arg) => arg.startsWith('--tenant-slug='))?.split('=')[1] || null,
  };
}

async function backfillTenantAccounts(options = {}) {
  const args = { ...parseArgs(), ...options };
  await database.connectDB();

  try {
    const query = { accountId: null };
    if (args.tenantSlug) query.slug = args.tenantSlug;
    const tenants = await Tenant.find(query).sort({ createdAt: 1 });
    const summary = { dryRun: !args.apply, scanned: tenants.length, created: 0, skipped: [], accounts: [] };

    for (const tenant of tenants) {
      const ownerMembership = await Membership.findOne({
        tenantId: tenant._id,
        role: 'owner',
        status: 'active',
      }).sort({ createdAt: 1 });

      if (!ownerMembership) {
        summary.skipped.push({ tenantId: String(tenant._id), slug: tenant.slug, reason: 'owner_not_found' });
        continue;
      }

      const owner = await User.findById(ownerMembership.userId).select('email');
      const preview = {
        tenantId: String(tenant._id),
        tenantSlug: tenant.slug,
        accountSlug: accountService.accountSlugForTenant(tenant),
        ownerUserId: String(ownerMembership.userId),
      };

      if (args.apply) {
        const account = await accountService.createForTenant(tenant, ownerMembership.userId, {
          billingEmail: owner?.email || '',
        });
        preview.accountId = String(account._id);
        summary.created += 1;
      }

      summary.accounts.push(preview);
    }

    console.log(JSON.stringify(summary, null, 2));
    return summary;
  } finally {
    await database.disconnectDB();
  }
}

if (require.main === module) {
  backfillTenantAccounts().catch((error) => {
    console.error('[AccountBackfill] failed:', error);
    process.exitCode = 1;
  });
}

module.exports = backfillTenantAccounts;
module.exports.parseArgs = parseArgs;
