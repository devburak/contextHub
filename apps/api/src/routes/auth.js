const AuthService = require('../services/authService');
const { tenantContext } = require('../middleware/auth');

async function authRoutes(fastify, options) {
  const authService = new AuthService(fastify);

  // POST /auth/login - Giriş yap
  fastify.post('/auth/login', {
    preHandler: [tenantContext],
    schema: {
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 }
        },
        required: ['email', 'password']
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
            token: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { email, password } = request.body;
      const result = await authService.login(email, password, request.tenantId);
      
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
            token: { type: 'string' }
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
