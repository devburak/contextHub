const featureFlagService = require('../services/featureFlagService');
const { authenticate, requireAdmin, tenantContext } = require('../middleware/auth');

async function featureFlagRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);

  fastify.get('/feature-flags', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            flags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  key: { type: 'string' },
                  label: { type: 'string' },
                  description: { type: 'string' },
                  defaultEnabled: { type: 'boolean' },
                  notes: { type: 'string' },
                  createdAt: { type: 'string' },
                  updatedAt: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const flags = await featureFlagService.listFlags();
    return reply.send({ flags });
  });

  fastify.post('/feature-flags', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          key: { type: 'string', minLength: 1 },
          label: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          defaultEnabled: { type: 'boolean' },
          notes: { type: 'string' }
        },
        required: ['key', 'label']
      },
      response: {
        201: {
          type: 'object',
          properties: {
            flag: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                key: { type: 'string' },
                label: { type: 'string' },
                description: { type: 'string' },
                defaultEnabled: { type: 'boolean' },
                notes: { type: 'string' },
                createdAt: { type: 'string' },
                updatedAt: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const flag = await featureFlagService.createFlag(request.body);
      return reply.code(201).send({ flag });
    } catch (error) {
      const status = error.statusCode || 400;
      return reply.code(status).send({ error: 'FeatureFlagError', message: error.message });
    }
  });
}

module.exports = featureFlagRoutes;
