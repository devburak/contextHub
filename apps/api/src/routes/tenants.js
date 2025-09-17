const tenantService = require('../services/tenantService');
const { tenantContext, authenticate } = require('../middleware/auth');

async function tenantRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);

  fastify.post('/tenants', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          slug: { type: 'string', minLength: 1 },
          plan: { type: 'string' }
        },
        required: ['name']
      },
      response: {
        201: {
          type: 'object',
          properties: {
            tenant: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                slug: { type: 'string' },
                plan: { type: 'string' },
                status: { type: 'string' },
                createdAt: { type: 'string' }
              }
            },
            membership: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                role: { type: 'string' },
                status: { type: 'string' }
              }
            },
            token: { type: 'string' }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { name, slug, plan } = request.body;
      const { tenant, membership } = await tenantService.createTenant({ name, slug, plan }, request.user._id);

      const token = fastify.jwt.sign({
        sub: request.user._id.toString(),
        email: request.user.email,
        role: membership.role,
        tenantId: tenant._id.toString()
      }, { expiresIn: '24h' });

      return reply.code(201).send({
        tenant: {
          id: tenant._id.toString(),
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          status: tenant.status,
          createdAt: tenant.createdAt
        },
        membership: {
          id: membership._id.toString(),
          role: membership.role,
          status: membership.status
        },
        token
      });
    } catch (error) {
      if (error.message.includes('slug')) {
        return reply.code(409).send({ error: 'Tenant slug already exists' });
      }
      return reply.code(400).send({ error: 'Tenant creation failed', message: error.message });
    }
  });

  fastify.get('/tenants', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          includeTokens: { type: ['boolean', 'string'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            tenants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  tenantId: { type: 'string' },
                  tenant: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      slug: { type: 'string' },
                      plan: { type: 'string' },
                      status: { type: 'string' },
                      createdAt: { type: 'string' }
                    }
                  },
                  role: { type: 'string' },
                  status: { type: 'string' },
                  token: { type: 'string' }
                }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const includeTokens = request.query?.includeTokens === true || request.query?.includeTokens === 'true';
      const tenants = await tenantService.listUserTenants(request.user._id);

      const enhanced = includeTokens
        ? tenants.map((membership) => ({
            ...membership,
            token: fastify.jwt.sign({
              sub: request.user._id.toString(),
              email: request.user.email,
              role: membership.role,
              tenantId: membership.tenantId
            }, { expiresIn: '24h' })
          }))
        : tenants;

      return reply.send({ tenants: enhanced });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to fetch tenants', message: error.message });
    }
  });
}

module.exports = tenantRoutes;
