const { Tenant, mongoose } = require('@contexthub/common');
const { runTenantWebhookPipeline } = require('../lib/webhookTrigger');
const { publishDueScheduledContent } = require('../services/contentService');
const { purgeIrrecoverableWebhookJobs } = require('../lib/webhookDispatcher');

function resolvePositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function resolveNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

const DOMAIN_EVENT_LIMIT = resolvePositiveNumber(process.env.DOMAIN_EVENT_BATCH_LIMIT);
const WEBHOOK_LIMIT = resolvePositiveNumber(process.env.WEBHOOK_DISPATCH_LIMIT);
const MAX_RETRY_ATTEMPTS = resolvePositiveNumber(process.env.WEBHOOK_MAX_RETRY_ATTEMPTS);
const RETRY_BACKOFF_MS = resolveNonNegativeNumber(process.env.WEBHOOK_RETRY_BACKOFF_MS);
const FAILED_CLEANUP_MS = resolveNonNegativeNumber(process.env.WEBHOOK_FAILED_CLEANUP_MS);
const SCHEDULED_PUBLISH_LIMIT = resolvePositiveNumber(process.env.SCHEDULED_PUBLISH_LIMIT) || 50;

async function processTenant(tenant) {
  const tenantId = tenant._id.toString();
  const slug = tenant.slug;
  const summary = { tenantId, slug };

  try {
    summary.scheduled = await publishDueScheduledContent({ tenantId, limit: SCHEDULED_PUBLISH_LIMIT });
  } catch (error) {
    console.error('[cronWebhooks] Scheduled publish failed', { tenantId, slug, error });
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
    console.error('[cronWebhooks] Webhook pipeline failed', { tenantId, slug, error });
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
    console.error('[cronWebhooks] Cleanup failed', { tenantId, slug, error });
    summary.cleanup = { deleted: 0, error: error.message };
  }

  return summary;
}

async function cronWebhooks(fastify) {
  fastify.post('/cron/webhooks', {
    schema: {
      description: 'Trigger webhook processing, scheduled content publishing, and cleanup for all tenants (requires CRON_SECRET_TOKEN)',
      summary: 'Run webhook cron job',
      tags: ['cron'],
      headers: {
        type: 'object',
        properties: {
          'x-cron-secret': {
            type: 'string',
            description: 'Secret token from CRON_SECRET_TOKEN env variable'
          }
        },
        required: ['x-cron-secret']
      },
      querystring: {
        type: 'object',
        properties: {
          tenant: {
            type: 'string',
            description: 'Optional: process only this tenant (ID or slug)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            aggregate: {
              type: 'object',
              properties: {
                tenantsProcessed: { type: 'number' },
                scheduledMatched: { type: 'number' },
                scheduledPublished: { type: 'number' },
                eventsProcessed: { type: 'number' },
                webhooksDispatched: { type: 'number' },
                retryRequeued: { type: 'number' },
                cleanupDeleted: { type: 'number' }
              }
            },
            summaries: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tenantId: { type: 'string' },
                  slug: { type: 'string' },
                  scheduled: { type: 'object' },
                  pipeline: { type: 'object' },
                  cleanup: { type: 'object' }
                }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' }
          }
        }
      }
    }
  }, async function cronWebhooksHandler(request, reply) {
    const secretToken = process.env.CRON_SECRET_TOKEN;
    const providedToken = request.headers['x-cron-secret'];

    if (!secretToken || !providedToken || providedToken !== secretToken) {
      return reply.code(401).send({ error: 'Unauthorized: Invalid or missing cron secret token' });
    }

    const targetTenantValue = request.query.tenant;
    let tenants;

    try {
      if (!targetTenantValue) {
        tenants = await Tenant.find({ status: { $ne: 'archived' } }, '_id slug status').lean();
      } else {
        const query = mongoose.Types.ObjectId.isValid(targetTenantValue)
          ? { _id: targetTenantValue }
          : { slug: targetTenantValue };
        const tenant = await Tenant.findOne(query, '_id slug status').lean();
        if (!tenant) {
          return reply.code(404).send({ error: 'Tenant not found' });
        }
        tenants = [tenant];
      }

      if (!tenants.length) {
        return reply.send({
          ok: true,
          aggregate: {
            tenantsProcessed: 0,
            scheduledMatched: 0,
            scheduledPublished: 0,
            eventsProcessed: 0,
            webhooksDispatched: 0,
            retryRequeued: 0,
            cleanupDeleted: 0
          },
          summaries: []
        });
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

      console.log('[cronWebhooks] Run completed', { aggregate });

      return reply.send({
        ok: true,
        aggregate,
        summaries
      });
    } catch (error) {
      console.error('[cronWebhooks] Fatal error', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}

module.exports = cronWebhooks;
