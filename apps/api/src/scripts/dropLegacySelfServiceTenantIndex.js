const path = require('path');
const dotenv = require('dotenv');
const { database, Tenant } = require('@contexthub/common');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function isLegacySelfServiceTenantIndex(index = {}) {
  const keyNames = Object.keys(index.key || {});
  const partial = index.partialFilterExpression || {};
  return index.unique === true
    && keyNames.length === 2
    && index.key.createdBy === 1
    && index.key.provisioningChannel === 1
    && partial.createdBy?.$type === 'objectId'
    && partial.provisioningChannel === 'self_service';
}

async function migrateLegacySelfServiceTenantIndex({
  apply = false,
  collection = Tenant.collection,
} = {}) {
  const matches = (await collection.indexes()).filter(isLegacySelfServiceTenantIndex);
  const summary = {
    apply,
    matchedIndexes: matches.map((index) => index.name),
    droppedIndexes: [],
  };

  if (apply) {
    for (const index of matches) {
      await collection.dropIndex(index.name);
      summary.droppedIndexes.push(index.name);
    }
  }

  return summary;
}

async function main(argv = process.argv.slice(2)) {
  await database.connectDB();
  try {
    const summary = await migrateLegacySelfServiceTenantIndex({ apply: argv.includes('--apply') });
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.apply && summary.matchedIndexes.length > 0) {
      console.log('Dry run only. Re-run with --apply to drop the legacy self-service tenant index.');
    }
    return summary;
  } finally {
    await database.disconnectDB();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[TenantProvisioningMigration] failed:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  isLegacySelfServiceTenantIndex,
  main,
  migrateLegacySelfServiceTenantIndex,
};
