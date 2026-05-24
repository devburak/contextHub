const placementService = require('../services/placementService');
const placementDecisionService = require('../services/placementDecisionService');
const placementAnalyticsService = require('../services/placementAnalyticsService');
const { PlacementEvent } = require('@contexthub/common');
const { tenantContext, authenticate, requireEditor } = require('../middleware/auth');
const {
  createPlacementSchema,
  updatePlacementSchema,
  placementListQuerySchema,
  decisionContextSchema,
  trackEventSchema,
  batchTrackSchema,
  statsQuerySchema,
  experienceSchema
} = require('../services/placementValidation');

const looseObjectSchema = {
  type: 'object',
  additionalProperties: true
};

const placementContextSchema = {
  type: 'object',
  required: ['path', 'sessionId'],
  additionalProperties: true,
  properties: {
    path: { type: 'string' },
    locale: { type: 'string' },
    device: { type: 'string', enum: ['mobile', 'tablet', 'desktop'] },
    browser: { type: 'string' },
    os: { type: 'string' },
    authenticated: { type: 'boolean' },
    userRoles: { type: 'array', items: { type: 'string' } },
    userTags: { type: 'array', items: { type: 'string' } },
    featureFlags: { type: 'array', items: { type: 'string' } },
    query: looseObjectSchema,
    cookies: looseObjectSchema,
    referrer: { type: 'string' },
    sessionId: { type: 'string' },
    userKey: { type: 'string' },
    seenCaps: {
      type: 'object',
      additionalProperties: { type: 'number' }
    }
  }
};

const placementDecisionSchema = {
  type: 'object',
  additionalProperties: true,
  properties: {
    decisionId: { type: 'string' },
    placementId: { type: 'string' },
    experienceId: { type: 'string' },
    contentType: {
      type: 'string',
      enum: ['content', 'media', 'form', 'html', 'component', 'external', 'text', 'image', 'video']
    },
    payload: looseObjectSchema,
    content: {
      type: 'object',
      additionalProperties: true,
      description: 'Renderer-ready content. Form placements include fields, settings, formId, form, and submitEndpoint.'
    },
    ui: looseObjectSchema,
    trigger: looseObjectSchema,
    placement: looseObjectSchema,
    experience: looseObjectSchema,
    tracking: looseObjectSchema,
    trackingContext: looseObjectSchema,
    meta: looseObjectSchema
  }
};

const publicPlacementDetailsSchema = {
  type: 'object',
  properties: {
    placement: {
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string' },
        slug: { type: 'string' },
        name: {},
        description: { type: 'string' },
        category: { type: 'string' },
        status: { type: 'string' },
        defaultRules: looseObjectSchema,
        settings: looseObjectSchema,
        tags: { type: 'array', items: { type: 'string' } },
        experiences: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              status: { type: 'string' },
              contentType: { type: 'string' },
              payload: looseObjectSchema,
              content: looseObjectSchema,
              ui: looseObjectSchema,
              trigger: looseObjectSchema,
              rules: looseObjectSchema,
              conversions: looseObjectSchema
            }
          }
        }
      }
    }
  }
};

/**
 * Placement API Routes
 */
async function placementRoutes(fastify, options) {
  // Apply tenant context to all routes
  fastify.addHook('preHandler', tenantContext);
  
  // ============================================================
  // ADMIN ROUTES - Placement CRUD
  // ============================================================

  /**
   * List placements
   */
  fastify.get('/placements', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const params = placementListQuerySchema.parse(request.query);
      
      const result = await placementService.listPlacements({
        tenantId: request.tenantId,
        ...params
      });

      return result;
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ error: error.errors });
      }
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get placement by ID
   */
  fastify.get('/placements/:id', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const placement = await placementService.getPlacementById({
        tenantId: request.tenantId,
        placementId: request.params.id
      });

      return placement;
    } catch (error) {
      return reply.code(404).send({ error: error.message });
    }
  });

  /**
   * Create placement
   */
  fastify.post('/placements', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    try {
      const data = createPlacementSchema.parse(request.body);
      
      const placement = await placementService.createPlacement({
        tenantId: request.tenantId,
        data,
        userId: request.user._id
      });

      return reply.code(201).send(placement);
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ error: error.errors });
      }
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Update placement
   */
  fastify.put('/placements/:id', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    try {
      const data = updatePlacementSchema.parse(request.body);
      
      const placement = await placementService.updatePlacement({
        tenantId: request.tenantId,
        placementId: request.params.id,
        data,
        userId: request.user._id
      });

      return placement;
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ error: error.errors });
      }
      if (error.message === 'Placement bulunamadı') {
        return reply.code(404).send({ error: error.message });
      }
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Archive placement
   */
  fastify.post('/placements/:id/archive', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    try {
      const placement = await placementService.archivePlacement({
        tenantId: request.tenantId,
        placementId: request.params.id,
        userId: request.user._id
      });

      return placement;
    } catch (error) {
      return reply.code(404).send({ error: error.message });
    }
  });

  /**
   * Delete placement
   */
  fastify.delete('/placements/:id', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    try {
      await placementService.deletePlacement({
        tenantId: request.tenantId,
        placementId: request.params.id
      });

      return { success: true };
    } catch (error) {
      return reply.code(404).send({ error: error.message });
    }
  });

  /**
   * Duplicate placement
   */
  fastify.post('/placements/:id/duplicate', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    try {
      const { name } = request.body;
      
      const placement = await placementService.duplicatePlacement({
        tenantId: request.tenantId,
        placementId: request.params.id,
        userId: request.user._id,
        newName: name
      });

      return reply.code(201).send(placement);
    } catch (error) {
      return reply.code(404).send({ error: error.message });
    }
  });

  // ============================================================
  // ADMIN ROUTES - Experience Management
  // ============================================================

  /**
   * Add experience to placement
   */
  fastify.post('/placements/:id/experiences', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    try {
      const experienceData = experienceSchema.parse(request.body);
      
      const experience = await placementService.addExperience({
        tenantId: request.tenantId,
        placementId: request.params.id,
        experience: experienceData,
        userId: request.user._id
      });

      return reply.code(201).send(experience);
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ error: error.errors });
      }
      return reply.code(404).send({ error: error.message });
    }
  });

  /**
   * Update experience
   */
  fastify.put('/placements/:id/experiences/:expId', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    try {
      const experienceData = experienceSchema.partial().parse(request.body);
      
      const experience = await placementService.updateExperience({
        tenantId: request.tenantId,
        placementId: request.params.id,
        experienceId: request.params.expId,
        data: experienceData,
        userId: request.user._id
      });

      return experience;
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ error: error.errors });
      }
      return reply.code(404).send({ error: error.message });
    }
  });

  /**
   * Delete experience
   */
  fastify.delete('/placements/:id/experiences/:expId', {
    preHandler: [authenticate, requireEditor]
  }, async (request, reply) => {
    try {
      await placementService.deleteExperience({
        tenantId: request.tenantId,
        placementId: request.params.id,
        experienceId: request.params.expId,
        userId: request.user._id
      });

      return { success: true };
    } catch (error) {
      if (error.message === 'Son experience silinemez') {
        return reply.code(400).send({ error: error.message });
      }
      return reply.code(404).send({ error: error.message });
    }
  });

  /**
   * Explain placement decision for admin preview/debug panels.
   */
  fastify.post('/placements/debug-decision', {
    preHandler: [authenticate],
    schema: {
      tags: ['placements'],
      summary: 'Explain an admin placement decision',
      description: 'Evaluates a draft or saved placement against a test context and returns eligible/rejected experiences with rejection reasons.',
      security: [{ bearerAuth: [] }],
      body: {
        type: 'object',
        required: ['placement', 'context'],
        properties: {
          placement: looseObjectSchema,
          context: placementContextSchema
        }
      },
      response: {
        200: looseObjectSchema,
        400: looseObjectSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { placement, context } = request.body || {};
      if (!placement || !context) {
        return reply.code(400).send({ error: 'placement and context are required' });
      }

      const result = await placementDecisionService.explainDecision({
        tenantId: request.tenantId,
        placement,
        context
      });

      return result || { selected: null, eligible: [], rejected: [], evaluated: [] };
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // ============================================================
  // PUBLIC ROUTES - Decision Engine
  // ============================================================

  /**
   * Get placement decision (which experience to show)
   */
  fastify.post('/public/placements/decide', {
    schema: {
      tags: ['placements'],
      summary: 'Get a public placement decision',
      description: 'Returns the eligible experience for a placement slug with renderer-ready content, UI, trigger, and tracking context. Use X-Tenant-ID for public integrations.',
      security: [{ tenantId: [] }],
      body: {
        type: 'object',
        required: ['placement', 'context'],
        properties: {
          placement: { type: 'string' },
          context: placementContextSchema
        }
      },
      response: {
        200: placementDecisionSchema,
        400: looseObjectSchema,
        404: looseObjectSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { placement, context } = decisionContextSchema.parse(request.body);
      
      const decision = await placementDecisionService.decide({
        tenantId: request.tenantId,
        placementSlug: placement,
        context
      });

      if (!decision) {
        return reply.code(404).send({ error: 'No eligible experience found' });
      }

      return decision;
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ error: error.errors });
      }
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get public placement details for custom renderers/builders
   */
  fastify.get('/public/placements/:slug', {
    schema: {
      tags: ['placements'],
      summary: 'Get public placement details',
      description: 'Returns active placement metadata and active experiences for custom UI builders or presentation layers. Form experiences include the public form definition and submit endpoint.',
      security: [{ tenantId: [] }],
      params: {
        type: 'object',
        required: ['slug'],
        properties: {
          slug: { type: 'string' }
        }
      },
      response: {
        200: publicPlacementDetailsSchema,
        404: looseObjectSchema
      }
    }
  }, async (request, reply) => {
    try {
      const placement = await placementDecisionService.getPublicPlacementDetails({
        tenantId: request.tenantId,
        placementSlug: request.params.slug
      });

      if (!placement) {
        return reply.code(404).send({ error: 'Placement not found' });
      }

      return { placement };
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Batch decision (multiple placements at once)
   */
  fastify.post('/public/placements/decide-batch', {
    schema: {
      tags: ['placements'],
      summary: 'Get public placement decisions in batch',
      description: 'Returns a slug-keyed object with decisions for eligible placements.',
      security: [{ tenantId: [] }],
      body: {
        type: 'object',
        required: ['placements', 'context'],
        properties: {
          placements: {
            type: 'array',
            minItems: 1,
            items: { type: 'string' }
          },
          context: placementContextSchema
        }
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: placementDecisionSchema
        },
        400: looseObjectSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { placements, context } = request.body;
      
      if (!Array.isArray(placements) || placements.length === 0) {
        return reply.code(400).send({ error: 'placements array required' });
      }

      const decisions = await placementDecisionService.decideBatch({
        tenantId: request.tenantId,
        placements,
        context
      });

      return decisions;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  // ============================================================
  // PUBLIC ROUTES - Event Tracking
  // ============================================================

  /**
   * Track single event
   */
  fastify.post('/public/placements/event', {
    schema: {
      tags: ['placements'],
      summary: 'Track a public placement event',
      description: 'Tracks impression, view, click, close, dismiss, submit, conversion, or error events for placement analytics.',
      security: [{ tenantId: [] }],
      body: {
        type: 'object',
        required: ['placementId', 'experienceId', 'type', 'sessionId', 'path'],
        additionalProperties: true,
        properties: {
          placementId: { type: 'string' },
          experienceId: { type: 'string' },
          type: {
            type: 'string',
            enum: ['impression', 'view', 'click', 'close', 'dismiss', 'submit', 'conversion', 'error']
          },
          sessionId: { type: 'string' },
          trackingId: { type: 'string' },
          userKey: { type: 'string' },
          path: { type: 'string' },
          referrer: { type: 'string' },
          locale: { type: 'string' },
          device: { type: 'string', enum: ['mobile', 'tablet', 'desktop', 'unknown'] },
          conversionGoal: { type: 'string' },
          conversionValue: { type: 'number' },
          formId: { type: 'string' },
          formData: looseObjectSchema,
          metadata: looseObjectSchema
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        },
        400: looseObjectSchema
      }
    }
  }, async (request, reply) => {
    try {
      const eventData = trackEventSchema.parse(request.body);
      
      await PlacementEvent.trackEvent({
        ...eventData,
        tenantId: request.tenantId
      });

      return { success: true };
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ error: error.errors });
      }
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Track batch events (offline queue)
   */
  fastify.post('/public/placements/events/batch', {
    schema: {
      tags: ['placements'],
      summary: 'Track public placement events in batch',
      description: 'Accepts queued placement analytics events from SDK/offline clients.',
      security: [{ tenantId: [] }],
      body: {
        type: 'object',
        required: ['events'],
        properties: {
          events: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: looseObjectSchema
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            count: { type: 'number' }
          }
        },
        400: looseObjectSchema
      }
    }
  }, async (request, reply) => {
    try {
      const { events } = batchTrackSchema.parse(request.body);
      
      // Add tenantId to all events
      const eventsWithTenant = events.map(event => ({
        ...event,
        tenantId: request.tenantId
      }));

      await PlacementEvent.trackEventsBatch(eventsWithTenant);

      return { success: true, count: events.length };
    } catch (error) {
      if (error.name === 'ZodError') {
        return reply.code(400).send({ error: error.errors });
      }
      return reply.code(500).send({ error: error.message });
    }
  });

  // ============================================================
  // ANALYTICS ROUTES
  // ============================================================

  /**
   * Get placement totals and metrics
   */
  fastify.get('/placements/:id/stats/totals', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const { experienceId, startDate, endDate } = request.query;
      
      const totals = await placementAnalyticsService.getPlacementTotals({
        tenantId: request.tenantId.toString(),
        placementId: request.params.id,
        experienceId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });

      return totals;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get placement stats (time series)
   */
  fastify.get('/placements/:id/stats', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const { experienceId, startDate, endDate, groupBy = 'day' } = request.query;
      
      const stats = await placementAnalyticsService.getPlacementStats({
        tenantId: request.tenantId.toString(),
        placementId: request.params.id,
        experienceId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        groupBy
      });

      return stats;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get conversion funnel
   */
  fastify.get('/placements/:id/experiences/:expId/funnel', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const { startDate, endDate } = request.query;
      
      const funnel = await placementAnalyticsService.getConversionFunnel({
        tenantId: request.tenantId.toString(),
        placementId: request.params.id,
        experienceId: request.params.expId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });

      return funnel;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get A/B test results
   */
  fastify.get('/placements/:id/ab-test', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const { startDate, endDate } = request.query;
      
      const results = await placementAnalyticsService.getABTestResults({
        tenantId: request.tenantId.toString(),
        placementId: request.params.id,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });

      return results;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get device breakdown
   */
  fastify.get('/placements/:id/stats/devices', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const { experienceId, startDate, endDate } = request.query;
      
      const devices = await placementAnalyticsService.getDeviceBreakdown({
        tenantId: request.tenantId.toString(),
        placementId: request.params.id,
        experienceId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });

      return devices;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get browser breakdown
   */
  fastify.get('/placements/:id/stats/browsers', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const { experienceId, startDate, endDate } = request.query;
      
      const browsers = await placementAnalyticsService.getBrowserBreakdown({
        tenantId: request.tenantId.toString(),
        placementId: request.params.id,
        experienceId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined
      });

      return browsers;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get top performing pages
   */
  fastify.get('/placements/:id/stats/top-pages', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const { experienceId, startDate, endDate, limit } = request.query;
      
      const pages = await placementAnalyticsService.getTopPages({
        tenantId: request.tenantId.toString(),
        placementId: request.params.id,
        experienceId,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit: limit ? parseInt(limit) : 10
      });

      return pages;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get real-time stats (last hour)
   */
  fastify.get('/placements/:id/stats/realtime', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const stats = await placementAnalyticsService.getRealTimeStats({
        tenantId: request.tenantId.toString(),
        placementId: request.params.id
      });

      return stats;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get user journey
   */
  fastify.get('/placements/journey', {
    preHandler: [authenticate]
  }, async (request, reply) => {
    try {
      const { sessionId, userKey } = request.query;
      
      if (!sessionId && !userKey) {
        return reply.code(400).send({ error: 'sessionId or userKey required' });
      }

      const journey = await placementAnalyticsService.getUserJourney({
        tenantId: request.tenantId.toString(),
        sessionId,
        userKey
      });

      return journey;
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
}

module.exports = placementRoutes;
