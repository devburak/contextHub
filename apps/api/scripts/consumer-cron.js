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
const {
  resolveConsumerTenantQuery
} = require('../src/lib/consumerTenantTarget');

const targetArg = process.argv.find((argument) => argument.startsWith('--tenant='));
const targetTenant = targetArg ? targetArg.slice('--tenant='.length).trim() : null;

async function fetchTenants() {
  if (!targetTenant) {
    return Tenant.find({ status: { $ne: 'archived' } }, '_id slug status').lean();
  }

  const query = resolveConsumerTenantQuery(targetTenant);
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
