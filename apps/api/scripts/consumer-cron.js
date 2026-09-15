#!/usr/bin/env node

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { database, Tenant } = require('@contexthub/common');
const {
  createDomainEventConsumerRegistry
} = require('../src/lib/domainEventConsumerRegistry');
const {
  createDomainEventConsumerRunner
} = require('../src/lib/domainEventConsumerRunner');
const { runConsumerBatch } = require('../src/lib/domainEventConsumerProcess');
const { bootstrapExtensions } = require('../src/lib/pluginHost');
const { createExtensionApi } = require('../src/lib/extensionApi');
const {
  resolveConsumerTenantQuery
} = require('../src/lib/consumerTenantTarget');

const targetArg = process.argv.find((argument) => argument.startsWith('--tenant='));
const targetTenant = targetArg ? targetArg.slice('--tenant='.length).trim() : null;

async function fetchTenants() {
  if (!targetTenant) {
    return Tenant.find({ status: 'active' }, '_id slug status').lean();
  }

  const query = { ...resolveConsumerTenantQuery(targetTenant), status: 'active' };
  const tenant = await Tenant.findOne(query, '_id slug status').lean();
  return tenant ? [tenant] : [];
}

async function main() {
  await database.connectDB();

  const eventRegistry = createDomainEventConsumerRegistry();
  const extensionHost = await bootstrapExtensions({
    mode: 'consumer',
    eventRegistry,
    logger: console
  });
  const consumers = eventRegistry.list();
  if (!consumers.length) {
    console.log('[consumer-cron] No domain event consumers are configured');
    return;
  }

  const tenants = await fetchTenants();
  if (!tenants.length) {
    console.warn('[consumer-cron] No matching tenants found');
    return;
  }

  console.log('[consumer-cron] Extensions loaded', {
    plugins: extensionHost.registry.inventory(),
    consumers: consumers.map(({ name }) => name)
  });
  const runner = createDomainEventConsumerRunner({ registry: eventRegistry });
  const summaries = await runConsumerBatch({ tenants, runner, logger: console });
  console.log('[consumer-cron] Run summary', JSON.stringify(summaries, null, 2));
  // Establish event cursors before scanning existing sources. A new tenant's
  // `latest` cursor must never skip changes made during its initial reindex.
  for (const plugin of extensionHost.plugins) {
    if (typeof plugin.api.runScheduledTasks !== 'function') continue;
    const context = createExtensionApi({ manifest: plugin.manifest, eventRegistry });
    for (const tenant of tenants) {
      try {
        const result = await plugin.api.runScheduledTasks(context, { tenantId: String(tenant._id) });
        console.log('[consumer-cron] Scheduled task', { plugin: plugin.manifest.name, tenantId: String(tenant._id), result });
        if (result?.status === 'failed') process.exitCode = 1;
      } catch (error) {
        console.error('[consumer-cron] Scheduled task failed', { plugin: plugin.manifest.name, tenantId: String(tenant._id), code: error.code || error.name });
        process.exitCode = 1;
      }
    }
  }
}

main()
  .catch((error) => {
    console.error('[consumer-cron] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await database.disconnectDB();
    } catch (error) {
      console.error('[consumer-cron] Failed to close database connection', error);
      process.exitCode = 1;
    }
  });
