const userService = require('../services/userService');
const roleService = require('../services/roleService');
const AuthService = require('../services/authService');
const { 
  tenantContext, 
  authenticate,
  authenticateWithoutTenant,
  requirePermission
} = require('../middleware/auth');
const { rbac } = require('@contexthub/common');

const { PERMISSIONS, ROLE_KEYS } = rbac;

async function userRoutes(fastify, options) {
  // NOT: Global tenantContext hook'u kaldırıldı
  // Tenant gerektiren endpoint'ler kendi preHandler'larında tenantContext kullanacak

  // POST /users/check-email - Email ile kullanıcı kontrol et
  fastify.post('/users/check-email', {
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_MANAGE)],
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' }
        },
        required: ['email']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            exists: { type: 'boolean' },
            user: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { email } = request.body;
      const result = await userService.checkUserByEmail(email);
      
      return reply.send(result);
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // GET /users - Kullanıcı listesi (Admin+)
  fastify.get('/users', {
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_VIEW)],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          page: { type: 'number', default: 1 },
          limit: { type: 'number', default: 10 },
          search: { type: 'string' },
          status: { type: 'string' },
          role: { type: 'string' }
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
                  id: { type: 'string' },
                  email: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  role: { type: 'string' },
                  status: { type: 'string' },
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
                pages: { type: 'number' },
                offset: { type: 'number' },
                hasPrevPage: { type: 'boolean' },
                hasNextPage: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { page, limit, search, status, role } = request.query;
      const result = await userService.getUsersByTenant(request.tenantId, { page, limit, search, status, role });
      
      return reply.send(result);
    } catch (error) {
      if (error.message === 'Invalid tenant identifier') {
        return reply.code(400).send({ error: 'InvalidTenant', message: error.message });
      }
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // GET /users/:id - Tekil kullanıcı (Editor+)
  fastify.get('/users/:id', {
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_VIEW)],
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
      if (error.code === 'LAST_OWNER') {
        return reply.code(400).send({ error: 'LastOwnerRestriction', message: error.message });
      }
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // POST /users - Yeni kullanıcı oluştur (Admin+)
  fastify.post('/users', {
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_MANAGE)],
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          role: { type: 'string' }
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
      const {
        email,
        password,
        firstName,
        lastName,
        role = ROLE_KEYS.ADMIN
      } = request.body;

      const normalizedRole = roleService.normalizeKey(role) || ROLE_KEYS.ADMIN;

      const existingUser = await userService.findUserByEmail(email);

      if (existingUser) {
        const authService = new AuthService(fastify);

        try {
          const invite = await authService.inviteUser(
            email,
            request.tenantId,
            normalizedRole,
            request.user?._id ?? null
          );

          return reply.code(200).send({
            invite,
            message: 'Invitation sent to existing user'
          });
        } catch (inviteError) {
          if (inviteError.message === 'User already has access to this tenant') {
            return reply.code(409).send({
              error: 'UserAlreadyMember',
              message: inviteError.message
            });
          }

          return reply.code(400).send({
            error: 'UserInvitationFailed',
            message: inviteError.message || 'Unable to invite user'
          });
        }
      }

      const user = await userService.createUser({
        email,
        password,
        firstName,
        lastName,
        tenantId: request.tenantId,
        role: normalizedRole
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
      const status = error.message === 'Role not found' ? 400 : 500;
      return reply.code(status).send({ error: 'UserCreationFailed', message: error.message });
    }
  });

  // PUT /users/:id - Kullanıcı güncelle (Admin+)
  fastify.put('/users/:id', {
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_MANAGE)],
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
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_MANAGE)],
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

      const result = await userService.detachUserFromTenant(request.params.id, request.tenantId);

      if (!result) {
        return reply.code(404).send({ error: 'User membership not found' });
      }

      return reply.send({
        message: 'User detached from tenant',
        status: result.status,
        removedAt: result.removedAt
      });
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  // PUT /users/:id/role - Kullanıcı rolü güncelle (Admin+)
  fastify.put('/users/:id/role', {
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_ASSIGN_ROLE)],
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
          role: { type: 'string' }
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

      const { role: roleDoc, permissions } = await roleService.ensureRoleReference(
        membership,
        request.tenantId
      );

      return reply.send({
        membership: {
          ...membership.toObject(),
          permissions,
          roleMeta: roleService.formatRole(roleDoc)
        }
      });
    } catch (error) {
      const status = error.message === 'Role not found' ? 404 : 400;
      return reply.code(status).send({ error: 'RoleUpdateFailed', message: error.message });
    }
  });

  // PATCH /users/:id/toggle-status - Kullanıcı durumunu değiştir (Admin+)
  fastify.patch('/users/:id/toggle-status', {
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_MANAGE)],
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
      },
      response: {
        200: {
          type: 'object',
          properties: {
            membership: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                role: { type: 'string' },
                status: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const membership = await userService.toggleUserStatus(request.params.id, request.tenantId);

      if (!membership) {
        return reply.code(404).send({ error: 'User membership not found' });
      }

      return reply.send({
        membership: {
          id: membership._id.toString(),
          role: membership.role,
          status: membership.status
        }
      });
    } catch (error) {
      if (error.code === 'LAST_OWNER') {
        return reply.code(400).send({ error: 'LastOwnerRestriction', message: error.message });
      }
      return reply.code(400).send({ error: 'StatusUpdateFailed', message: error.message });
    }
  });

  // GET /users/me - Mevcut kullanıcı bilgileri
  fastify.get('/users/me', {
    preHandler: [authenticateWithoutTenant], // Tenant olmadan da çalışmalı
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' }
        }
        // tenantId artık opsiyonel
      }
    }
  }, async function(request, reply) {
    try {
      const memberships = await userService.getUserMemberships(request.user._id);
      
      // Eğer tenantId verilmişse, o tenant'a ait membership'i bul
      const activeMembership = request.query?.tenantId 
        ? memberships.find((item) => item.tenantId === request.query.tenantId)
        : null;
      
      return reply.send({ 
        user: {
          id: request.user._id.toString(),
          email: request.user.email,
          firstName: request.user.firstName,
          lastName: request.user.lastName,
          lastLoginAt: request.user.lastLoginAt
        },
        currentMembership: activeMembership,
        allMemberships: memberships
      });
    } catch (error) {
      return reply.code(500).send({ error: 'Internal server error', message: error.message });
    }
  });

  fastify.put('/users/me', {
    preHandler: [authenticateWithoutTenant], // Kendi profilini herkes güncelleyebilir
    schema: {
      body: {
        type: 'object',
        properties: {
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          email: { type: 'string', format: 'email' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const updated = await userService.updateOwnProfile(request.user._id, request.body);

      if (!updated) {
        return reply.code(404).send({ error: 'User not found' });
      }

      return reply.send({
        user: {
          id: updated._id?.toString?.() || request.user._id.toString(),
          email: updated.email,
          firstName: updated.firstName,
          lastName: updated.lastName
        }
      });
    } catch (error) {
      if (error.code === 11000) {
        return reply.code(409).send({ error: 'Email already exists' });
      }
      return reply.code(400).send({ error: 'ProfileUpdateFailed', message: error.message });
    }
  });

  // PUT /users/me/password - Şifre değiştir
  fastify.put('/users/me/password', {
    preHandler: [authenticateWithoutTenant], // Kendi şifresini herkes değiştirebilir
    schema: {
      body: {
        type: 'object',
        properties: {
          currentPassword: { type: 'string', minLength: 1 },
          newPassword: { type: 'string', minLength: 6 }
        },
        required: ['currentPassword', 'newPassword']
      }
      // tenantId artık gerekli değil
    }
  }, async function(request, reply) {
    try {
      const { currentPassword, newPassword } = request.body;
      
      // tenantId parametresini kaldırdık
      await userService.changePassword(
        request.user._id,
        null, // tenantId artık null
        currentPassword,
        newPassword
      );

      return reply.send({ message: 'Password changed successfully' });
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  // DELETE /users/me - Hesabı kalıcı olarak sil
  fastify.delete('/users/me', {
    preHandler: [authenticateWithoutTenant], // Tenant kontrolü yapma, tüm hesabı sil
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      await userService.deleteOwnAccount(request.user._id);
      return reply.send({ message: 'Account deleted successfully' });
    } catch (error) {
      return reply.code(400).send({ 
        error: 'AccountDeletionFailed', 
        message: error.message 
      });
    }
  });

  // POST /users/invite - Kullanıcı davet et (Admin+)
  fastify.post('/users/invite', {
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_INVITE)],
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          role: { type: 'string' }
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
      
      const authService = new AuthService(fastify);

      const result = await authService.inviteUser(
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

  fastify.post('/users/:id/reinvite', {
    preHandler: [tenantContext, authenticate, requirePermission(PERMISSIONS.USERS_INVITE)],
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
      const authService = new AuthService(fastify);
      const invitation = await authService.resendInvitation(
        request.params.id,
        request.tenantId,
        request.user?._id ?? null
      );

      return reply.send({ invitation });
    } catch (error) {
      const status = error.message === 'User membership not found' ? 404 : 400;
      return reply.code(status).send({ error: 'ReinviteFailed', message: error.message });
    }
  });

  // POST /memberships/:id/leave - Varlık üyeliğinden ayrıl
  fastify.post('/memberships/:id/leave', {
    preHandler: [tenantContext, authenticate], // Tenant context gerekli
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
          password: { type: 'string', minLength: 1 }
        },
        required: ['password']
      }
    }
  }, async function(request, reply) {
    try {
      const membershipId = request.params.id;
      const { password } = request.body;
      
      await userService.leaveMembership(
        request.user._id,
        membershipId,
        password
      );

      return reply.send({ 
        message: 'Successfully left the membership' 
      });
    } catch (error) {
      return reply.code(400).send({ 
        error: 'LeaveMembershipFailed', 
        message: error.message 
      });
    }
  });
}

module.exports = userRoutes;
