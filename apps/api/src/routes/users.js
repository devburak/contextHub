const userService = require('../services/userService');
const { 
  tenantContext, 
  authenticate, 
  requireAdmin, 
  requireEditor 
} = require('../middleware/auth');

async function userRoutes(fastify, options) {
  // Tüm user route'ları için tenant context gerekli
  fastify.addHook('preHandler', tenantContext);

  // GET /users - Kullanıcı listesi (Admin+)
  fastify.get('/users', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          page: { type: 'number', default: 1 },
          limit: { type: 'number', default: 10 },
          search: { type: 'string' }
        },
        required: ['tenantId']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            users: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  createdAt: { type: 'string' },
                  lastLoginAt: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'number' },
                limit: { type: 'number' },
                total: { type: 'number' },
                pages: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { page, limit, search } = request.query;
      const result = await userService.getUsersByTenant(request.tenantId, { page, limit, search });
      
      return reply.send(result);
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // GET /users/:id - Tekil kullanıcı (Editor+)
  fastify.get('/users/:id', {
    preHandler: [authenticate, requireEditor],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      }
    }
  }, async function(request, reply) {
    try {
      const user = await userService.getUserWithMembership(request.params.id, request.tenantId);
      
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({ user });
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // POST /users - Yeni kullanıcı oluştur (Admin+)
  fastify.post('/users', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          role: { type: 'string', enum: ['viewer', 'author', 'editor', 'admin'] }
        },
        required: ['email', 'password', 'firstName', 'lastName']
      },
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      }
    }
  }, async function(request, reply) {
    try {
      const { email, password, firstName, lastName, role = 'viewer' } = request.body;
      
      const user = await userService.createUser({
        email,
        password,
        firstName,
        lastName,
        tenantId: request.tenantId,
        role
      });

      return reply.code(201).send({ 
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      if (error.code === 11000) {
        return reply.code(409).send({ error: 'Email already exists' });
      }
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // PUT /users/:id - Kullanıcı güncelle (Admin+)
  fastify.put('/users/:id', {
    preHandler: [authenticate, requireAdmin],
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
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      }
    }
  }, async function(request, reply) {
    try {
      const user = await userService.updateUser(
        request.params.id, 
        request.tenantId, 
        request.body
      );

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({ user });
    } catch (error) {
      if (error.code === 11000) {
        return reply.code(409).send({ error: 'Email already exists' });
      }
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // DELETE /users/:id - Kullanıcı sil (Admin+)
  fastify.delete('/users/:id', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      },
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      }
    }
  }, async function(request, reply) {
    try {
      // Kendini silmeye çalışıyor mu kontrol et
      if (request.params.id === request.user._id.toString()) {
        return reply.code(400).send({ error: 'Cannot delete yourself' });
      }

      const user = await userService.deleteUser(request.params.id, request.tenantId);

      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({ message: 'User deleted successfully' });
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // PUT /users/:id/role - Kullanıcı rolü güncelle (Admin+)
  fastify.put('/users/:id/role', {
    preHandler: [authenticate, requireAdmin],
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
          role: { type: 'string', enum: ['viewer', 'author', 'editor', 'admin', 'owner'] }
        },
        required: ['role']
      },
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      }
    }
  }, async function(request, reply) {
    try {
      // Owner rolünü sadece mevcut owner verebilir
      if (request.body.role === 'owner' && request.userRole !== 'owner') {
        return reply.code(403).send({ error: 'Only owner can assign owner role' });
      }

      const membership = await userService.updateUserRole(
        request.params.id, 
        request.tenantId, 
        request.body.role
      );

      if (!membership) {
        return reply.code(404).send({ error: 'User membership not found' });
      }

      return reply.send({ membership });
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // GET /users/me - Mevcut kullanıcı bilgileri
  fastify.get('/users/me', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      }
    }
  }, async function(request, reply) {
    try {
      const memberships = await userService.getUserMemberships(request.user._id);
      
      return reply.send({ 
        user: {
          id: request.user._id,
          email: request.user.email,
          firstName: request.user.firstName,
          lastName: request.user.lastName,
          lastLoginAt: request.user.lastLoginAt
        },
        currentMembership: request.membership,
        allMemberships: memberships
      });
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // PUT /users/me/password - Şifre değiştir
  fastify.put('/users/me/password', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 6 }
        },
        required: ['currentPassword', 'newPassword']
      },
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      }
    }
  }, async function(request, reply) {
    try {
      const { currentPassword, newPassword } = request.body;
      
      await userService.changePassword(
        request.user._id,
        request.tenantId,
        currentPassword,
        newPassword
      );

      return reply.send({ message: 'Password changed successfully' });
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // POST /users/invite - Kullanıcı davet et (Admin+)
  fastify.post('/users/invite', {
    preHandler: [authenticate, requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['viewer', 'author', 'editor', 'admin'] }
        },
        required: ['email', 'role']
      },
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        },
        required: ['tenantId']
      }
    }
  }, async function(request, reply) {
    try {
      const { email, role } = request.body;
      
      const result = await AuthService.prototype.inviteUser.call(
        { fastify }, 
        email, 
        request.tenantId, 
        role, 
        request.user._id
      );

      return reply.code(201).send(result);
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });
}

module.exports = userRoutes;
