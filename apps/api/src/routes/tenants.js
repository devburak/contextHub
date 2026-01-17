const tenantService = require('../services/tenantService');
const roleService = require('../services/roleService');
const { authenticate, authenticateWithoutTenant } = require('../middleware/auth');

async function tenantRoutes(fastify) {

  fastify.post('/tenants', {
    preHandler: [authenticateWithoutTenant],
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
                roleMeta: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    key: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    level: { type: 'number' },
                    permissions: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  }
                },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                },
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

      const { role: roleDoc, permissions } = await roleService.ensureRoleReference(
        membership,
        tenant._id.toString()
      );

      const rolePayload = roleService.formatRole(roleDoc);

      const token = fastify.jwt.sign({
        sub: request.user._id.toString(),
        email: request.user.email,
        tokenVersion: request.user.tokenVersion ?? 0,
        role: rolePayload?.key || membership.role,
        roleId: rolePayload?.id || null,
        tenantId: tenant._id.toString(),
        permissions
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
          role: rolePayload?.key || membership.role,
          roleMeta: rolePayload,
          permissions,
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
    preHandler: [authenticateWithoutTenant],
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
                  roleMeta: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      id: { type: 'string' },
                      key: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      level: { type: 'number' },
                      permissions: {
                        type: 'array',
                        items: { type: 'string' }
                      }
                    }
                  },
                  permissions: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  status: { type: 'string' },
                  ownerCount: { type: 'number' },
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
              tokenVersion: request.user.tokenVersion ?? 0,
              role: membership.role,
              roleId: membership.roleMeta?.id || null,
              tenantId: membership.tenantId,
              permissions: membership.permissions || []
            }, { expiresIn: '24h' })
          }))
        : tenants;

      return reply.send({ tenants: enhanced });
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to fetch tenants', message: error.message });
    }
  });
  fastify.post('/tenants/:id/accept', {
    preHandler: [authenticateWithoutTenant],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            membership: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                tenantId: { type: 'string' },
                role: { type: 'string' },
                roleMeta: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    key: { type: 'string' },
                    name: { type: 'string' },
                    description: { type: 'string' },
                    level: { type: 'number' },
                    permissions: {
                      type: 'array',
                      items: { type: 'string' }
                    }
                  }
                },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                },
                status: { type: 'string' },
                acceptedAt: { type: 'string' }
              }
            },
            tenant: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                slug: { type: 'string' },
                plan: { type: 'string' },
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
      const tenantId = request.params.id;
      const membership = await tenantService.acceptMembershipInvitation(request.user._id, tenantId);

      const { role: roleDoc, permissions } = await roleService.ensureRoleReference(
        membership,
        tenantId
      );

      const rolePayload = roleService.formatRole(roleDoc);

      const token = fastify.jwt.sign({
        sub: request.user._id.toString(),
        email: request.user.email,
        tokenVersion: request.user.tokenVersion ?? 0,
        role: rolePayload?.key || membership.role,
        roleId: rolePayload?.id || null,
        tenantId,
        permissions
      }, { expiresIn: '24h' });

      const tenantDoc = membership.tenantId;

      return reply.send({
        membership: {
          id: membership._id.toString(),
          tenantId,
          role: rolePayload?.key || membership.role,
          roleMeta: rolePayload,
          permissions,
          status: membership.status,
          acceptedAt: membership.acceptedAt ? membership.acceptedAt.toISOString() : null
        },
        tenant: tenantDoc
          ? {
              id: tenantDoc._id.toString(),
              name: tenantDoc.name,
              slug: tenantDoc.slug,
              plan: tenantDoc.plan,
              status: tenantDoc.status
            }
          : null,
        token
      });
    } catch (error) {
      const status = error.message === 'Invitation not found' ? 404 : 400;
      return reply.code(status).send({ error: 'TenantInvitationAcceptFailed', message: error.message });
    }
  });

  // POST /tenants/:id/transfer-ownership - Sahiplik devri talebi
  fastify.post('/tenants/:id/transfer-ownership', {
    preHandler: [authenticateWithoutTenant],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 }
        },
        required: ['email', 'password']
      }
    }
  }, async function(request, reply) {
    try {
      const tenantId = request.params.id;
      const { email, password } = request.body;
      
      const result = await tenantService.requestOwnershipTransfer(
        tenantId,
        request.user._id,
        email,
        password
      );

      return reply.send({
        message: 'Ownership transfer request sent successfully',
        transfer: result
      });
    } catch (error) {
      return reply.code(400).send({ 
        error: 'OwnershipTransferFailed', 
        message: error.message 
      });
    }
  });

  // POST /tenants/:id/accept-transfer - Sahiplik devri kabul
  fastify.post('/tenants/:id/accept-transfer', {
    preHandler: [authenticateWithoutTenant],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 1 }
        },
        required: ['token']
      }
    }
  }, async function(request, reply) {
    try {
      const tenantId = request.params.id;
      const { token } = request.body;
      
      const result = await tenantService.acceptOwnershipTransfer(
        tenantId,
        request.user._id,
        token
      );

      return reply.send({
        message: 'Ownership transfer accepted successfully',
        membership: result
      });
    } catch (error) {
      return reply.code(400).send({ 
        error: 'OwnershipTransferAcceptFailed', 
        message: error.message 
      });
    }
  });
}

module.exports = tenantRoutes;
