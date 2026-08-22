const { tenantContext, authenticate, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('@contexthub/common/src/rbac/permissions');
const billingService = require('../services/billing/billingService');

function errorStatus(error) {
  if (error.code === 'AccountMigrationRequired') return 409;
  if (error.code === 'CheckoutNotConfigured') return 503;
  if (error.code === 'BillingDisabled') return 503;
  if (['PortalRequired', 'PortalUnavailable'].includes(error.code)) return 409;
  return error.statusCode || 400;
}

async function billingRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);

  fastify.get('/billing/overview', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.BILLING_VIEW)],
  }, async (request, reply) => {
    try {
      return reply.send(await billingService.getOverview(request.tenantId));
    } catch (error) {
      request.log.error({ err: error }, 'Billing overview failed');
      return reply.code(errorStatus(error)).send({ error: error.code || 'BillingError', message: error.message });
    }
  });

  fastify.post('/billing/checkout', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.BILLING_MANAGE)],
    schema: { body: { type: 'object', required: ['priceKey'], properties: { priceKey: { type: 'string', maxLength: 100 } } } },
  }, async (request, reply) => {
    try {
      return reply.send(await billingService.createCheckout(request.tenantId, request.body.priceKey));
    } catch (error) {
      request.log.error({ err: error }, 'Billing checkout failed');
      return reply.code(errorStatus(error)).send({ error: error.code || 'BillingError', message: error.message });
    }
  });

  fastify.post('/billing/portal', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.BILLING_MANAGE)],
  }, async (request, reply) => {
    try {
      return reply.send(await billingService.createPortalSession(request.tenantId));
    } catch (error) {
      request.log.error({ err: error }, 'Billing portal failed');
      return reply.code(errorStatus(error)).send({ error: error.code || 'BillingError', message: error.message });
    }
  });
}

module.exports = billingRoutes;
