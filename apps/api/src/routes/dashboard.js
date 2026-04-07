const dashboardService = require('../services/dashboardService')
const localRedisClient = require('../lib/localRedis')
const apiUsageService = require('../services/apiUsageService')
const {
  tenantContext,
  authenticate,
} = require('../middleware/auth')

async function dashboardRoutes(fastify) {
  fastify.addHook('preHandler', tenantContext)

  fastify.get('/dashboard/summary', {
    preHandler: [authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            totals: {
              type: 'object',
              properties: {
                users: { type: 'number' },
                contents: { type: 'number' },
                media: {
                  type: 'object',
                  properties: {
                    count: { type: 'number' },
                    totalSize: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async function summaryHandler(request, reply) {
    try {
      const payload = await dashboardService.getSummary({
        tenantId: request.tenantId,
      })

      return reply.send(payload)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to resolve dashboard summary')
      return reply.code(400).send({
        error: 'DashboardSummaryFailed',
        message: error.message,
      })
    }
  })

  fastify.get('/dashboard/activities', {
    preHandler: [authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          scope: { type: 'string', enum: ['tenant', 'self'] },
          limit: { type: 'number', minimum: 1, maximum: 50 },
          offset: { type: 'number', minimum: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  entityId: { type: 'string' },
                  entityType: { type: 'string' },
                  action: { type: 'string' },
                  title: { type: 'string' },
                  timestamp: { type: 'string' },
                  actorId: { type: ['string', 'null'] },
                  actor: {
                    anyOf: [
                      { type: 'null' },
                      {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          email: { type: ['string', 'null'] },
                        },
                      },
                    ],
                  },
                  metadata: { type: 'object' },
                },
              },
            },
            pagination: {
              type: 'object',
              properties: {
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' },
              },
            },
            availableTypes: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  }, async function activitiesHandler(request, reply) {
    try {
      const isOwner = request.userRole === 'owner'
      const requestedScope = request.query.scope || (isOwner ? 'tenant' : 'self')
      const effectiveScope = isOwner ? requestedScope : 'self'
      const includeAllMembers = isOwner && effectiveScope === 'tenant'

      const payload = await dashboardService.getRecentActivities({
        tenantId: request.tenantId,
        actorId: request.user?._id?.toString(),
        includeAllMembers,
        type: request.query.type,
        limit: request.query.limit,
        offset: request.query.offset,
      })

      return reply.send(payload)
    } catch (error) {
      request.log.error({ err: error }, 'Failed to resolve dashboard activities')
      return reply.code(400).send({
        error: 'DashboardActivitiesFailed',
        message: error.message,
      })
    }
  })

  // Get API call statistics from MongoDB + local Redis delta counters
  fastify.get('/dashboard/api-stats', {
    preHandler: [authenticate],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            fourHour: { type: 'number' },
            daily: { type: 'number' },
            today: { type: 'number' },
            weekly: { type: 'number' },
            monthly: { type: 'number' },
            enabled: { type: 'boolean' },
          },
        },
      },
    },
  }, async function apiStatsHandler(request, reply) {
    try {
      const stats = await apiUsageService.getUsageStats(request.tenantId)

      return reply.send({
        ...stats,
        enabled: true,
      })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to resolve API stats')
      return reply.code(400).send({
        error: 'ApiStatsFailed',
        message: error.message,
      })
    }
  })

  // Debug endpoint to inspect current 4-hour counter state
  fastify.get('/dashboard/api-stats-debug', {
    preHandler: [authenticate],
  }, async function apiStatsDebugHandler(request, reply) {
    try {
      const tenantId = request.tenantId;
      const now = new Date();
      const period = apiUsageService.getFourHourPeriod(now);
      const key = localRedisClient.getUsageCounterKey(tenantId, period.periodKey);
      const counter = tenantId ? await localRedisClient.getUsageCounter(tenantId, period.periodKey) : null;

      return reply.send({
        tenantId,
        provider: 'local',
        periodKey: period.periodKey,
        key,
        count: counter?.count || 0,
        flushed: counter?.flushed || 0,
        pending: counter?.pending || 0,
        updatedAt: counter?.updatedAt || null,
      })
    } catch (error) {
      request.log.error({ err: error }, 'Failed to debug API stats')
      return reply.code(400).send({
        error: 'ApiStatsDebugFailed',
        message: error.message,
        stack: error.stack,
      })
    }
  })
}

module.exports = dashboardRoutes
