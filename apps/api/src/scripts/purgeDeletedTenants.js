#!/usr/bin/env node

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const { database } = require('@contexthub/common');
const tenantLifecycleService = require('../services/tenantLifecycleService');

async function main() {
  await database.connectDB();
  const reconciled = await tenantLifecycleService.reconcileDeletedTenantControls();
  const purged = await tenantLifecycleService.purgeDueTenants(new Date());
  console.log(JSON.stringify({
    reconciled: reconciled.length,
    purgeCandidates: purged.length,
    results: { reconciled, purged },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('[tenant-purge] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await database.disconnectDB().catch(() => {});
  });
