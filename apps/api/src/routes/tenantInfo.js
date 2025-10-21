const { Tenant, TenantSettings } = require('@contexthub/common');
const { tenantContext, authenticate } = require('../middleware/auth');

/**
 * Tenant Info Route
 * Public tenant information accessible via API tokens
 * Returns tenant name, slug, and brand settings
 */
async function tenantInfoRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext);

  /**
   * GET /tenant/info
   * Get current tenant's public information and brand settings
   * Accessible via API tokens - no special permissions required
   */
  fastify.get('/tenant/info', {
    preHandler: [authenticate],
    schema: {
      tags: ['tenant'],
      description: 'Get current tenant public information and brand settings',
      security: [{ bearerAuth: [] }, { apiToken: [] }],
      response: {
        200: {
          description: 'Tenant information',
          type: 'object',
          properties: {
            tenant: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                slug: { type: 'string' },
                plan: { type: 'string' },
                status: { type: 'string' }
              }
            },
            branding: {
              type: 'object',
              nullable: true,
              properties: {
                name: { type: 'string', nullable: true },
                siteName: { type: 'string', nullable: true },
                description: { type: 'string', nullable: true },
                logo: { type: 'string', nullable: true },
                logoUrl: { type: 'string', nullable: true },
                favicon: { type: 'string', nullable: true },
                faviconUrl: { type: 'string', nullable: true },
                primaryColor: { type: 'string', nullable: true },
                secondaryColor: { type: 'string', nullable: true }
              }
            },
            metadata: {
              type: 'object',
              nullable: true,
              additionalProperties: true,
              description: 'Custom metadata key-value pairs'
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const tenantId = request.tenantId;

      // Get tenant info with settings
      const tenant = await Tenant.findById(tenantId)
        .select('name slug plan status')
        .lean();

      if (!tenant) {
        return reply.code(404).send({
          error: 'NotFound',
          message: 'Tenant not found'
        });
      }

      // Get tenant settings with branding and metadata
      const settings = await TenantSettings.findOne({ tenantId })
        .select('branding metadata')
        .lean();

      // Build response with tenant, branding, and metadata
      const response = {
        tenant: {
          id: tenant._id.toString(),
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan || 'free',
          status: tenant.status || 'active'
        },
        branding: null,
        metadata: null
      };

      // Add branding if exists
      if (settings?.branding) {
        response.branding = {
          name: settings.branding.name || tenant.name,
          logo: settings.branding.logo || null,
          logoUrl: settings.branding.logoUrl || null,
          favicon: settings.branding.favicon || null,
          faviconUrl: settings.branding.faviconUrl || null,
          primaryColor: settings.branding.primaryColor || null,
          secondaryColor: settings.branding.secondaryColor || null,
          description: settings.branding.description || null,
          siteName: settings.branding.siteName || null
        };
      }

      // Add metadata if exists (convert Map to Object)
      if (settings?.metadata && settings.metadata instanceof Map && settings.metadata.size > 0) {
        response.metadata = Object.fromEntries(settings.metadata);
      } else if (settings?.metadata && typeof settings.metadata === 'object' && Object.keys(settings.metadata).length > 0) {
        // If already an object (from lean())
        response.metadata = settings.metadata;
      }

      return reply.send(response);

    } catch (error) {
      request.log.error({ err: error }, 'Failed to get tenant info');
      return reply.code(500).send({
        error: 'InternalServerError',
        message: 'Failed to get tenant information'
      });
    }
  });
}

module.exports = tenantInfoRoutes;
