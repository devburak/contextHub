const tenantSettingsService = require('../services/tenantSettingsService');
const { tenantContext, authenticate, requireAdmin } = require('../middleware/auth');

async function tenantSettingsRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);

  const settingsSchema = {
    type: 'object',
    properties: {
      tenantId: { type: 'string' },
      createdAt: { type: 'string', nullable: true },
      updatedAt: { type: 'string', nullable: true },
      smtp: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          host: { type: 'string' },
          port: { type: 'number', nullable: true },
          secure: { type: 'boolean' },
          username: { type: 'string' },
          fromName: { type: 'string' },
          fromEmail: { type: 'string' },
          hasPassword: { type: 'boolean' }
        },
        additionalProperties: false
      },
      webhook: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          url: { type: 'string' },
          hasSecret: { type: 'boolean' }
        },
        additionalProperties: false
      },
      branding: {
        type: 'object',
        properties: {
          siteName: { type: 'string' },
          logoUrl: { type: 'string' },
          primaryColor: { type: 'string' },
          secondaryColor: { type: 'string' },
          description: { type: 'string' }
        },
        additionalProperties: false
      },
      limits: {
        type: 'object',
        properties: {
          entries: { type: 'number', nullable: true },
          media: { type: 'number', nullable: true },
          users: { type: 'number', nullable: true },
          apiCalls: { type: 'number', nullable: true },
          emailPerMonth: { type: 'number', nullable: true },
          custom: {
            type: 'object',
            additionalProperties: { type: 'number', nullable: true }
          }
        },
        additionalProperties: false
      },
      features: {
        type: 'object',
        additionalProperties: { type: 'boolean' }
      },
      metadata: {
        type: 'object'
      }
    },
    additionalProperties: false
  };

  const updateSchema = {
    type: 'object',
    properties: {
      smtp: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          host: { type: 'string', nullable: true },
          port: { type: 'number', nullable: true },
          secure: { type: 'boolean' },
          username: { type: 'string', nullable: true },
          password: { type: 'string', nullable: true },
          fromName: { type: 'string', nullable: true },
          fromEmail: { type: 'string', nullable: true }
        },
        additionalProperties: false
      },
      webhook: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          url: { type: 'string', nullable: true },
          secret: { type: 'string', nullable: true }
        },
        additionalProperties: false
      },
      branding: {
        type: 'object',
        properties: {
          siteName: { type: 'string', nullable: true },
          logoUrl: { type: 'string', nullable: true },
          primaryColor: { type: 'string', nullable: true },
          secondaryColor: { type: 'string', nullable: true },
          description: { type: 'string', nullable: true }
        },
        additionalProperties: false
      },
      limits: {
        type: 'object',
        properties: {
          entries: { type: 'number', nullable: true },
          media: { type: 'number', nullable: true },
          users: { type: 'number', nullable: true },
          apiCalls: { type: 'number', nullable: true },
          emailPerMonth: { type: 'number', nullable: true },
          custom: {
            type: 'object',
            additionalProperties: { type: 'number', nullable: true }
          }
        },
        additionalProperties: false
      },
      features: {
        type: 'object',
        additionalProperties: { type: 'boolean' }
      },
      metadata: {
        type: 'object'
      }
    },
    additionalProperties: false
  };

  fastify.get('/tenant-settings', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            settings: settingsSchema
          }
        }
      }
    }
  }, async function getTenantSettings(request) {
    const settings = await tenantSettingsService.getSettings(request.tenantId);
    return { settings };
  });

  fastify.put('/tenant-settings', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      body: updateSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            settings: settingsSchema
          }
        }
      }
    }
  }, async function updateTenantSettings(request) {
    const settings = await tenantSettingsService.upsertSettings(request.tenantId, request.body);
    return { settings };
  });
}

module.exports = tenantSettingsRoutes;
