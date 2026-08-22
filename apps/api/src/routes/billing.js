const { tenantContext, authenticate, requirePermission } = require('../middleware/auth');
const { PERMISSIONS } = require('@contexthub/common/src/rbac/permissions');
const billingService = require('../services/billing/billingService');

function errorStatus(error) {
  if (error.code === 'AccountMigrationRequired') return 409;
  if (['CheckoutNotConfigured', 'BillingDisabled', 'BillingProviderUnavailable', 'BillingPiiNotConfigured'].includes(error.code)) return 503;
  if (['PortalRequired', 'PortalUnavailable', 'BillingJurisdictionLocked'].includes(error.code)) return 409;
  if (['BillingProfileIncomplete', 'CommercialAgreementRequired', 'InvalidBillingProfile', 'PlanPriceUnavailable'].includes(error.code)) return 422;
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
    schema: { body: {
      type: 'object',
      additionalProperties: false,
      anyOf: [{ required: ['priceId'] }, { required: ['priceKey'] }],
      properties: {
        priceId: { type: 'string', maxLength: 100 },
        priceKey: { type: 'string', maxLength: 100 },
      },
    } },
  }, async (request, reply) => {
    try {
      return reply.send(await billingService.createCheckout(request.tenantId, request.body.priceId || request.body.priceKey));
    } catch (error) {
      request.log.error({ err: error }, 'Billing checkout failed');
      return reply.code(errorStatus(error)).send({ error: error.code || 'BillingError', message: error.message });
    }
  });

  fastify.put('/billing/profile', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.BILLING_MANAGE)],
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: [
          'billingEmail',
          'legalName',
          'profileType',
          'contactFirstName',
          'contactLastName',
          'phone',
          'country',
          'address',
          'declarationAccepted',
          'serviceAgreementAccepted',
        ],
        properties: {
          billingEmail: { type: 'string', maxLength: 254 },
          legalName: { type: 'string', maxLength: 200 },
          profileType: { type: 'string', enum: ['individual', 'business'] },
          contactFirstName: { type: 'string', maxLength: 100 },
          contactLastName: { type: 'string', maxLength: 100 },
          phone: { type: 'string', maxLength: 30 },
          country: { type: 'string', minLength: 2, maxLength: 2 },
          taxId: { type: 'string', maxLength: 32 },
          taxOffice: { type: 'string', maxLength: 120 },
          declarationAccepted: { type: 'boolean', const: true },
          serviceAgreementAccepted: { type: 'boolean', const: true },
          address: {
            type: 'object',
            additionalProperties: false,
            required: ['line1', 'city', 'postalCode'],
            properties: {
              line1: { type: 'string', maxLength: 250 },
              line2: { type: 'string', maxLength: 250 },
              city: { type: 'string', maxLength: 100 },
              district: { type: 'string', maxLength: 100 },
              region: { type: 'string', maxLength: 100 },
              postalCode: { type: 'string', maxLength: 24 },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      return reply.send(await billingService.updateBillingProfile(request.tenantId, request.body, request.user._id));
    } catch (error) {
      request.log.error({ err: error }, 'Billing profile update failed');
      return reply.code(errorStatus(error)).send({
        error: error.code || 'BillingError',
        message: error.message,
        details: error.details,
      });
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
