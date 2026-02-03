const AuthService = require('../services/authService');

async function authRoutes(fastify, options) {
  const authService = new AuthService(fastify);

  // POST /auth/login - Giriş yap
  fastify.post('/auth/login', {
    schema: {
      description: 'Authenticate user with email and password',
      summary: 'User login',
      tags: ['auth'],
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', description: 'User email address' },
          password: { type: 'string', minLength: 1, description: 'User password' },
          tenantId: { type: 'string', description: 'Optional tenant ID for multi-tenant login' }
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
                mustChangePassword: { type: 'boolean' },
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
            message: { type: 'string' },
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
      const result = await authService.login(email, password, tenantId, request);
      
      return reply.send(result);
    } catch (error) {
      const statusCode = error.statusCode || 401;
      const response = {
        error: error.code === 'EMAIL_NOT_VERIFIED'
          ? 'EMAIL_NOT_VERIFIED'
          : (statusCode === 429 ? 'Too many attempts' : 'Authentication failed'),
        message: error.message
      };

      if (error.retryAfterSeconds) {
        response.retryAfterSeconds = error.retryAfterSeconds;
      }
      if (error.blocked) {
        response.blocked = true;
      }
      if (error.code === 'EMAIL_NOT_VERIFIED' && error.email) {
        response.email = error.email;
      }

      return reply.code(statusCode).send(response);
    }
  });

  // POST /auth/register - Kayıt ol (tenant opsiyonel)
  fastify.post('/auth/register', {
    schema: {
      description: 'Register a new user with optional tenant creation',
      summary: 'User registration',
      tags: ['auth'],
      body: {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email', description: 'User email address' },
          password: { type: 'string', minLength: 6, description: 'Password (minimum 6 characters)' },
          firstName: { type: 'string', minLength: 1, description: 'User first name' },
          lastName: { type: 'string', minLength: 1, description: 'User last name' },
          tenantName: { type: 'string', minLength: 1, description: 'Optional tenant name to create' },
          tenantSlug: { type: 'string', minLength: 1, description: 'Optional tenant slug (URL identifier)' }
        },
        required: ['email', 'password', 'firstName', 'lastName']
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
              nullable: true,
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
      const result = await authService.register(request.body, request);
      
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
      description: 'Refresh an existing JWT token',
      summary: 'Token refresh',
      tags: ['auth'],
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
      description: 'Accept a tenant invitation and create/update user account',
      summary: 'Accept invitation',
      tags: ['auth'],
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
                mustChangePassword: { type: 'boolean' },
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
      description: 'Logout user (currently no token invalidation)',
      summary: 'User logout',
      tags: ['auth'],
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

  // POST /auth/forgot-password - Şifre sıfırlama talebi
  fastify.post('/auth/forgot-password', {
    schema: {
      description: 'Request a password reset email',
      summary: 'Forgot password',
      tags: ['auth'],
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
            message: { type: 'string' }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { email } = request.body;
      await authService.forgotPassword(email, request);
      
      return reply.send({ 
        message: 'Password reset email sent successfully' 
      });
    } catch (error) {
      // Güvenlik için her zaman başarılı mesajı dön
      // (E-posta var mı yok mu belli olmasın)
      return reply.send({ 
        message: 'Password reset email sent successfully' 
      });
    }
  });

  // POST /auth/reset-password - Şifre sıfırlama
  fastify.post('/auth/reset-password', {
    schema: {
      description: 'Reset password using token from email',
      summary: 'Reset password',
      tags: ['auth'],
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 1 },
          password: { type: 'string', minLength: 6 }
        },
        required: ['token', 'password']
      },
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
    try {
      const { token, password } = request.body;
      await authService.resetPassword(token, password, request);
      
      return reply.send({
        message: 'Password reset successfully'
      });
    } catch (error) {
      return reply.code(400).send({
        error: 'PasswordResetFailed',
        message: error.message
      });
    }
  });

  // POST /auth/verify-email - E-posta doğrulama
  fastify.post('/auth/verify-email', {
    schema: {
      body: {
        type: 'object',
        properties: {
          token: { type: 'string', minLength: 1 }
        },
        required: ['token']
      },
      response: {
        200: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            verified: { type: 'boolean' },
            alreadyVerified: { type: 'boolean' }
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
      const result = await authService.verifyEmail(request.body.token, request);
      return reply.send(result);
    } catch (error) {
      return reply.code(400).send({
        error: 'EmailVerificationFailed',
        message: error.message
      });
    }
  });

  // POST /auth/resend-verification - Doğrulama e-postasını yeniden gönder
  fastify.post('/auth/resend-verification', {
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
      const result = await authService.resendVerificationEmail(request.body.email, request);
      return reply.send(result);
    } catch (error) {
      return reply.code(400).send({
        error: 'ResendVerificationFailed',
        message: error.message
      });
    }
  });
}

module.exports = authRoutes;
