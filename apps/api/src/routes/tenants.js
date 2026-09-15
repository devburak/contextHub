const tenantService = require('../services/tenantService');
const tenantLifecycleService = require('../services/tenantLifecycleService');
const roleService = require('../services/roleService');
const { authenticateWithoutTenant } = require('../middleware/auth');
const AuthService = require('../services/authService');
const { setSessionCookie } = require('../services/sessionSecurity');

async function tenantRoutes(fastify) {

  fastify.get('/tenants/creation-options', {
    preHandler: [authenticateWithoutTenant],
  }, async function(request) {
    return tenantService.getCreationOptions(request.user._id);
  });

  fastify.post('/tenants', {
    preHandler: [authenticateWithoutTenant],
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1 },
          slug: { type: 'string', minLength: 1 },
          requestedPlanSlug: { type: 'string', pattern: '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$', maxLength: 80 }
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
            csrfToken: { type: 'string' }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { name, slug, requestedPlanSlug } = request.body;
      const { tenant, membership } = await tenantService.createTenant({ name, slug, requestedPlanSlug }, request.user._id);

      const { role: roleDoc, permissions } = await roleService.ensureRoleReference(
        membership,
        tenant._id.toString()
      );

      const rolePayload = roleService.formatRole(roleDoc);

      const authService = new AuthService(fastify);
      const session = await authService.switchTenant(
        request.user._id,
        tenant._id.toString(),
        request.authPayload,
        request
      );
      setSessionCookie(reply, session.token);

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
        csrfToken: session.csrfToken
      });
    } catch (error) {
      if (error.code === 'FreeTenantLimit') {
        return reply.code(409).send({
          error: error.code,
          message: error.message,
        });
      }
      if (error.code === 'SlugConflict' || error.message.includes('slug')) {
        const suggestions = error.suggestions
          || await tenantService.generateSlugSuggestions(request.body.slug || request.body.name);
        return reply.code(409).send({
          error: 'SlugConflict',
          message: 'Tenant slug already exists',
          suggestions,
        });
      }
      return reply.code(400).send({ error: 'Tenant creation failed', message: error.message });
    }
  });

  fastify.get('/tenants', {
    preHandler: [authenticateWithoutTenant],
    schema: {
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
                  ownerCount: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const tenants = await tenantService.listUserTenants(request.user._id);
      return reply.send({ tenants });
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
            csrfToken: { type: 'string' }
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

      const authService = new AuthService(fastify);
      const session = await authService.switchTenant(
        request.user._id,
        tenantId,
        request.authPayload,
        request
      );
      setSessionCookie(reply, session.token);

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
        csrfToken: session.csrfToken
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

  fastify.get('/tenants/:id/deletion-preflight', {
    preHandler: [authenticateWithoutTenant],
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } },
      },
    },
  }, async function(request, reply) {
    try {
      return reply.send(await tenantLifecycleService.getDeletionPreflight(
        request.params.id,
        request.user._id
      ));
    } catch (error) {
      return reply.code(error.statusCode || 400).send({
        error: error.code || 'TenantDeletionPreflightFailed',
        message: error.message,
        details: error.details,
      });
    }
  });

  fastify.get('/tenants/deleted', {
    preHandler: [authenticateWithoutTenant],
  }, async function(request, reply) {
    try {
      return reply.send({
        tenants: await tenantLifecycleService.listRestorableTenants(request.user._id),
      });
    } catch (error) {
      return reply.code(error.statusCode || 400).send({
        error: error.code || 'DeletedTenantListFailed',
        message: error.message,
      });
    }
  });

  fastify.delete('/tenants/:id', {
    preHandler: [authenticateWithoutTenant],
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['currentPassword', 'confirmation'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          confirmation: { type: 'string', minLength: 1, maxLength: 200 },
          reason: { type: 'string', maxLength: 1000 },
          cancelAtPeriodEnd: { type: 'boolean', default: false },
        },
      },
    },
  }, async function(request, reply) {
    try {
      return reply.send(await tenantLifecycleService.deleteTenant(
        request.params.id,
        request.user._id,
        request.body,
        request
      ));
    } catch (error) {
      return reply.code(error.statusCode || 400).send({
        error: error.code || 'TenantDeletionFailed',
        message: error.message,
        details: error.details,
      });
    }
  });

  fastify.post('/tenants/:id/restore', {
    preHandler: [authenticateWithoutTenant],
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['id'],
        properties: { id: { type: 'string', pattern: '^[a-fA-F0-9]{24}$' } },
      },
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['currentPassword', 'confirmation'],
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          confirmation: { type: 'string', minLength: 1, maxLength: 200 },
        },
      },
    },
  }, async function(request, reply) {
    try {
      return reply.send(await tenantLifecycleService.restoreTenant(
        request.params.id,
        request.user._id,
        request.body,
        request
      ));
    } catch (error) {
      return reply.code(error.statusCode || 400).send({
        error: error.code || 'TenantRestoreFailed',
        message: error.message,
        details: error.details,
      });
    }
  });
}

module.exports = tenantRoutes;
