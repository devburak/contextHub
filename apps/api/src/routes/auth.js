const AuthService = require('../services/authService');

async function authRoutes(fastify, options) {
  const authService = new AuthService(fastify);

  // POST /auth/login - Giriş yap
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 },
          tenantId: { type: 'string' }
        },
        required: ['email', 'password']
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
                lastName: { type: 'string' },
                role: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            },
            token: { type: 'string' },
            memberships: {
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
                      slug: { type: 'string' }
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
                      },
                      tenantId: { type: 'string' },
                      isDefault: { type: 'boolean' },
                      isSystem: { type: 'boolean' }
                    }
                  },
                  status: { type: 'string' },
                  permissions: {
                    type: 'array',
                    items: { type: 'string' }
                  },
                  token: { type: 'string' }
                }
              }
            },
            requiresTenantSelection: { type: 'boolean' },
            activeMembership: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                tenantId: { type: 'string' },
                tenant: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    slug: { type: 'string' }
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
                    },
                    tenantId: { type: 'string' },
                    isDefault: { type: 'boolean' },
                    isSystem: { type: 'boolean' }
                  }
                },
                status: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                },
                token: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { email, password, tenantId: tenantFromBody } = request.body;
      const tenantId = tenantFromBody || request.query.tenantId;
      const result = await authService.login(email, password, tenantId);
      
      return reply.send(result);
    } catch (error) {
      return reply.code(401).send({ error: 'Authentication failed', message: error.message });
    }
  });

  // POST /auth/register - Kayıt ol (yeni tenant ile)
  fastify.post('/auth/register', {
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 },
          tenantName: { type: 'string', minLength: 1 },
          tenantSlug: { type: 'string', minLength: 1 }
        },
        required: ['email', 'password', 'firstName', 'lastName', 'tenantName']
      },
      response: {
        201: {
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
            },
            tenant: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                slug: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const result = await authService.register(request.body);
      
      return reply.code(201).send(result);
    } catch (error) {
      if (error.message.includes('already exists')) {
        return reply.code(409).send({ error: 'Conflict', message: error.message });
      }
      return reply.code(400).send({ error: 'Registration failed', message: error.message });
    }
  });

  // POST /auth/refresh - Token yenile
  fastify.post('/auth/refresh', {
    schema: {
      body: {
        type: 'object',
        properties: {
          token: { type: 'string' }
        },
        required: ['token']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            role: { type: 'string' },
            permissions: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { token } = request.body;
      const result = await authService.refreshToken(token);
      
      return reply.send(result);
    } catch (error) {
      return reply.code(401).send({ error: 'Token refresh failed', message: error.message });
    }
  });

  fastify.post('/auth/invitations/accept', {
    schema: {
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 10 },
          password: { type: 'string', minLength: 6 },
          firstName: { type: 'string', minLength: 1 },
          lastName: { type: 'string', minLength: 1 }
        },
        required: ['token']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
                permissions: {
                  type: 'array',
                  items: { type: 'string' }
                }
              }
            },
            membership: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                tenantId: { type: 'string' },
                status: { type: 'string' },
                acceptedAt: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { token, password, firstName, lastName } = request.body;
      const result = await authService.acceptInvitation(token, { password, firstName, lastName });

      return reply.send(result);
    } catch (error) {
      const status = /expired/i.test(error.message) ? 410 : 400;
      return reply.code(status).send({ error: 'InvitationAcceptFailed', message: error.message });
    }
  });

  // POST /auth/logout - Çıkış yap (şu an için token invalidation yok)
  fastify.post('/auth/logout', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    }
  }, async function(request, reply) {
    // Gelecekte token blacklist'e eklenebilir
    return reply.send({ message: 'Logged out successfully' });
  });
}

module.exports = authRoutes;
