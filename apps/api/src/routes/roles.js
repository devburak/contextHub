const { tenantContext, authenticate, requirePermission } = require('../middleware/auth');
const roleService = require('../services/roleService');
const { rbac } = require('@contexthub/common');

const { PERMISSIONS } = rbac;

async function roleRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);

  fastify.get('/roles', {
    preHandler: [
      authenticate,
      requirePermission([PERMISSIONS.ROLES_VIEW, PERMISSIONS.ROLES_MANAGE], { mode: 'any' })
    ],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            roles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  key: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  level: { type: 'number' },
                  permissions: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  tenantId: { type: 'string', nullable: true },
                  isDefault: { type: 'boolean' },
                  isSystem: { type: 'boolean' }
                }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const roles = await roleService.listRoles(request.tenantId);
      return reply.send({ roles });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list roles');
      return reply.code(500).send({ error: 'Internal Server Error', message: error.message });
    }
  });

  fastify.post('/roles', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.ROLES_MANAGE)],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          key: { type: 'string' },
          level: { type: 'number' },
          permissions: {
            type: 'array',
            items: { type: 'string' }
          },
          baseRoleKey: { type: 'string' }
        },
        required: ['name']
      },
      response: {
        201: {
          type: 'object',
          properties: {
            role: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                key: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                level: { type: 'number' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                },
                tenantId: { type: 'string', nullable: true },
                isDefault: { type: 'boolean' },
                isSystem: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const role = await roleService.createRole(
        request.tenantId,
        request.body,
        request.user?._id
      );
      return reply.code(201).send({ role });
    } catch (error) {
      const status = error.message.includes('exists') ? 409 : 400;
      return reply.code(status).send({ error: 'RoleCreationFailed', message: error.message });
    }
  });

  fastify.put('/roles/:id', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.ROLES_MANAGE)],
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
          name: { type: 'string' },
          description: { type: 'string' },
          level: { type: 'number' },
          permissions: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const role = await roleService.updateRole(
        request.params.id,
        request.tenantId,
        request.body,
        request.user?._id
      );
      return reply.send({ role });
    } catch (error) {
      const status = error.message === 'Role not found' ? 404 : 400;
      return reply.code(status).send({ error: 'RoleUpdateFailed', message: error.message });
    }
  });

  fastify.delete('/roles/:id', {
    preHandler: [authenticate, requirePermission(PERMISSIONS.ROLES_MANAGE)],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  }, async function(request, reply) {
    try {
      await roleService.deleteRole(request.params.id, request.tenantId);
      return reply.send({ success: true });
    } catch (error) {
      const status = error.message === 'Role not found' ? 404 : 400;
      return reply.code(status).send({ error: 'RoleDeleteFailed', message: error.message });
    }
  });
}

module.exports = roleRoutes;
