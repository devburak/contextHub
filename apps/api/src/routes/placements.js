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

  // ============================================================
  // PUBLIC ROUTES - Decision Engine
  // ============================================================

  /**
   * Get placement decision (which experience to show)
   */
  fastify.post('/public/placements/decide', async (request, reply) => {
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
   * Batch decision (multiple placements at once)
   */
  fastify.post('/public/placements/decide-batch', async (request, reply) => {
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
  fastify.post('/public/placements/event', async (request, reply) => {
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
  fastify.post('/public/placements/events/batch', async (request, reply) => {
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
