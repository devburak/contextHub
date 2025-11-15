#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const { database, Tenant, mongoose } = require('@contexthub/common');
const { runTenantWebhookPipeline } = require('../src/lib/webhookTrigger');
const { publishDueScheduledContent } = require('../src/services/contentService');
const { purgeIrrecoverableWebhookJobs } = require('../src/lib/webhookDispatcher');

const resolvePositiveNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const resolveNonNegativeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const DOMAIN_EVENT_LIMIT = resolvePositiveNumber(process.env.DOMAIN_EVENT_BATCH_LIMIT);
const WEBHOOK_LIMIT = resolvePositiveNumber(process.env.WEBHOOK_DISPATCH_LIMIT);
const MAX_RETRY_ATTEMPTS = resolvePositiveNumber(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS);
const RETRY_BACKOFF_MS = resolveNonNegativeNumber(process.env.WEBHOOK_RETRY_BACKOFF_MS);
const FAILED_CLEANUP_MS = resolveNonNegativeNumber(process.env.WEBHOOK_FAILED_CLEANUP_MS);
const SCHEDULED_PUBLISH_LIMIT = resolvePositiveNumber(process.env.SCHEDULED_PUBLISH_LIMIT) || 50;

const targetArg = process.argv.find((arg) => arg.startsWith('--tenant='));
const targetTenantValue = targetArg ? targetArg.split('=')[1] : null;

async function fetchTenants() {
  if (!targetTenantValue) {
    return Tenant.find({ status: { $ne: 'archived' } }, '_id slug status').lean();
  }

  const query = mongoose.Types.ObjectId.isValid(targetTenantValue)
    ? { _id: targetTenantValue }
    : { slug: targetTenantValue };
  const tenant = await Tenant.findOne(query, '_id slug status').lean();
  if (!tenant) {
    return [];
  }
  return [tenant];
}

async function processTenant(tenant) {
  const tenantId = tenant._id.toString();
  const slug = tenant.slug;
  console.log(`[webhook-cron] Processing tenant ${slug} (${tenantId})`);
  const summary = { tenantId, slug };

  try {
    summary.scheduled = await publishDueScheduledContent({ tenantId, limit: SCHEDULED_PUBLISH_LIMIT });
  } catch (error) {
    console.error('[webhook-cron] Scheduled publish failed', { tenantId, slug, error });
    summary.scheduled = { matched: 0, published: 0, eventsEmitted: 0, error: error.message };
  }

  try {
    summary.pipeline = await runTenantWebhookPipeline({
      tenantId,
      domainEventLimit: DOMAIN_EVENT_LIMIT,
      webhookLimit: WEBHOOK_LIMIT,
      maxRetryAttempts: MAX_RETRY_ATTEMPTS,
      retryBackoffMs: RETRY_BACKOFF_MS
    });
  } catch (error) {
    console.error('[webhook-cron] Webhook pipeline failed', { tenantId, slug, error });
    summary.pipeline = {
      eventsResult: { processed: 0, error: error.message },
      retryResult: { retried: 0, matched: 0 },
      dispatchResult: { processed: 0, failed: 0, skipped: 0, error: error.message }
    };
  }

  try {
    summary.cleanup = await purgeIrrecoverableWebhookJobs({
      tenantId,
      maxAttempts: MAX_RETRY_ATTEMPTS,
      olderThanMs: FAILED_CLEANUP_MS
    });
  } catch (error) {
    console.error('[webhook-cron] Cleanup failed', { tenantId, slug, error });
    summary.cleanup = { deleted: 0, error: error.message };
  }

  return summary;
}

async function main() {
  try {
    await database.connectDB();
    const tenants = await fetchTenants();
    if (!tenants.length) {
      console.warn('[webhook-cron] No tenants found for cron run');
      await database.disconnectDB();
      process.exit(0);
    }

    const aggregate = {
      tenantsProcessed: 0,
      scheduledMatched: 0,
      scheduledPublished: 0,
      eventsProcessed: 0,
      webhooksDispatched: 0,
      retryRequeued: 0,
      cleanupDeleted: 0
    };

    const summaries = [];

    for (const tenant of tenants) {
      const summary = await processTenant(tenant);
      summaries.push(summary);
      aggregate.tenantsProcessed += 1;
      aggregate.scheduledMatched += summary.scheduled?.matched || 0;
      aggregate.scheduledPublished += summary.scheduled?.published || 0;
      aggregate.eventsProcessed += summary.pipeline?.eventsResult?.processed || 0;
      aggregate.webhooksDispatched += summary.pipeline?.dispatchResult?.processed || 0;
      aggregate.retryRequeued += summary.pipeline?.retryResult?.retried || 0;
      aggregate.cleanupDeleted += summary.cleanup?.deleted || 0;
    }

    console.log('[webhook-cron] Run summary:', JSON.stringify({ aggregate, summaries }, null, 2));
    await database.disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('[webhook-cron] Fatal error', error);
    try {
      await database.disconnectDB();
    } catch (disconnectError) {
      console.error('[webhook-cron] Failed to close database connection', disconnectError);
    }
    process.exit(1);
  }
}

main();
