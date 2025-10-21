const crypto = require('crypto');
const ApiToken = require('@contexthub/common/src/models/ApiToken');
const { tenantContext, authenticate } = require('../middleware/auth');

/**
 * API Token Management Routes
 * Allows owners to create and manage API tokens for external applications
 */
async function apiTokenRoutes(fastify) {
  // Add tenant context to all routes
  fastify.addHook('preHandler', tenantContext);

  /**
   * GET /api-tokens
   * List all API tokens for the current tenant
   */
  fastify.get('/api-tokens', {
    preHandler: [authenticate],
    schema: {
      tags: ['apiTokens'],
      description: 'List all API tokens for the current tenant (Owner only)',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'List of API tokens',
          type: 'object',
          properties: {
            tokens: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  scopes: { type: 'array', items: { type: 'string' } },
                  expiresAt: { type: 'string', format: 'date-time', nullable: true },
                  lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  createdBy: {
                    type: 'object',
                    nullable: true,
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      email: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async function listTokensHandler(request, reply) {
    try {
      const tenantId = request.tenantId;
      const userRole = request.userRole;

      // Only owners can view API tokens
      if (userRole !== 'owner') {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Only owners can view API tokens',
        });
      }

      const tokens = await ApiToken.find({ tenantId })
        .select('-hash') // Don't return the hash
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 });

      return reply.send({
        tokens: tokens.map(token => ({
          id: token._id.toString(),
          name: token.name,
          scopes: token.scopes,
          expiresAt: token.expiresAt,
          lastUsedAt: token.lastUsedAt,
          createdAt: token.createdAt,
          createdBy: token.createdBy ? {
            id: token.createdBy._id.toString(),
            name: token.createdBy.name,
            email: token.createdBy.email,
          } : null,
        })),
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to list API tokens');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to list API tokens',
      });
    }
  });

  /**
   * POST /api-tokens
   * Create a new API token
   */
  fastify.post('/api-tokens', {
    preHandler: [authenticate],
    schema: {
      tags: ['apiTokens'],
      description: 'Create a new API token for Content-as-a-Service access (Owner only). Token is returned only once!',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, description: 'Human-readable name for the token' },
          scopes: {
            type: 'array',
            items: { type: 'string', enum: ['read', 'write', 'delete'] },
            description: 'Permissions for this token',
            default: ['read']
          },
          expiresInDays: {
            type: 'number',
            minimum: 0,
            description: 'Token expiration in days (0 = unlimited)'
          },
        },
        required: ['name'],
      },
      response: {
        201: {
          description: 'Token created successfully. Save the token - it cannot be retrieved again!',
          type: 'object',
          properties: {
            token: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                token: { type: 'string', description: 'The actual token starting with ctx_ - save this securely!' },
                name: { type: 'string' },
                scopes: { type: 'array', items: { type: 'string' } },
                expiresAt: { type: 'string', format: 'date-time', nullable: true },
                createdAt: { type: 'string', format: 'date-time' }
              }
            },
            warning: { type: 'string', description: 'Security warning about token visibility' }
          }
        }
      }
    },
  }, async function createTokenHandler(request, reply) {
    try {
      const tenantId = request.tenantId;
      const userRole = request.userRole;
      const userId = request.user._id;
      const { name, scopes = ['read'], expiresInDays } = request.body;

      // Only owners can create API tokens
      if (userRole !== 'owner') {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Only owners can create API tokens',
        });
      }

      // Generate a secure random token
      const tokenValue = crypto.randomBytes(32).toString('hex');
      const token = `ctx_${tokenValue}`; // Add prefix immediately

      // Hash the token for storage (with prefix)
      const hash = crypto.createHash('sha256').update(token).digest('hex');

      // Calculate expiration date if provided
      let expiresAt = null;
      if (expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }

      // Create token
      const apiToken = new ApiToken({
        tenantId,
        name,
        hash,
        scopes,
        expiresAt,
        createdBy: userId,
      });

      await apiToken.save();

      console.log(`[ApiToken] Created token: ${name} for tenant ${tenantId}`);

      // Return the token ONLY ONCE - it won't be shown again
      return reply.code(201).send({
        message: 'API token created successfully',
        token: {
          id: apiToken._id.toString(),
          name: apiToken.name,
          token: token, // Already has ctx_ prefix
          scopes: apiToken.scopes,
          expiresAt: apiToken.expiresAt,
          createdAt: apiToken.createdAt,
        },
        warning: 'Save this token securely. You won\'t be able to see it again.',
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to create API token');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to create API token',
      });
    }
  });

  /**
   * DELETE /api-tokens/:tokenId
   * Delete an API token
   */
  fastify.delete('/api-tokens/:tokenId', {
    preHandler: [authenticate],
    schema: {
      tags: ['apiTokens'],
      description: 'Delete an API token (Owner only)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        properties: {
          tokenId: { type: 'string', description: 'Token ID to delete' }
        },
        required: ['tokenId']
      },
      response: {
        200: {
          description: 'Token deleted successfully',
          type: 'object',
          properties: {
            message: { type: 'string' }
          }
        }
      }
    }
  }, async function deleteTokenHandler(request, reply) {
    try {
      const tenantId = request.tenantId;
      const userRole = request.userRole;
      const { tokenId } = request.params;

      // Only owners can delete API tokens
      if (userRole !== 'owner') {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Only owners can delete API tokens',
        });
      }

      const token = await ApiToken.findOne({ _id: tokenId, tenantId });

      if (!token) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'API token not found',
        });
      }

      await ApiToken.deleteOne({ _id: tokenId });

      console.log(`[ApiToken] Deleted token: ${token.name} for tenant ${tenantId}`);

      return reply.send({
        message: 'API token deleted successfully',
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to delete API token');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to delete API token',
      });
    }
  });

  /**
   * PUT /api-tokens/:tokenId
   * Update an API token (name, scopes only - not the token itself)
   */
  fastify.put('/api-tokens/:tokenId', {
    preHandler: [authenticate],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          scopes: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  }, async function updateTokenHandler(request, reply) {
    try {
      const tenantId = request.tenantId;
      const userRole = request.userRole;
      const { tokenId } = request.params;
      const { name, scopes } = request.body;

      // Only owners can update API tokens
      if (userRole !== 'owner') {
        return reply.code(403).send({
          error: 'Forbidden',
          message: 'Only owners can update API tokens',
        });
      }

      const token = await ApiToken.findOne({ _id: tokenId, tenantId });

      if (!token) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'API token not found',
        });
      }

      // Update fields
      if (name !== undefined) token.name = name;
      if (scopes !== undefined) token.scopes = scopes;

      await token.save();

      console.log(`[ApiToken] Updated token: ${token.name} for tenant ${tenantId}`);

      return reply.send({
        message: 'API token updated successfully',
        token: {
          id: token._id.toString(),
          name: token.name,
          scopes: token.scopes,
          expiresAt: token.expiresAt,
          lastUsedAt: token.lastUsedAt,
          createdAt: token.createdAt,
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to update API token');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to update API token',
      });
    }
  });
}

module.exports = apiTokenRoutes;
