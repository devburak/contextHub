const dashboardService = require('../services/dashboardService')
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
}

module.exports = dashboardRoutes
