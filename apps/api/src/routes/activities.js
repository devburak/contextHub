const { authenticate, tenantContext } = require('../middleware/auth');
const ActivityLog = require('@contexthub/common/src/models/ActivityLog');

async function activityRoutes(fastify, options) {
  // GET /activities - Get activity logs
  fastify.get('/activities', {
    preHandler: authenticate,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', minimum: 1, default: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          action: { type: 'string' },
          userId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            activities: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      firstName: { type: 'string' },
                      lastName: { type: 'string' },
                      email: { type: 'string' }
                    }
                  },
                  action: { type: 'string' },
                  description: { type: 'string' },
                  metadata: { type: 'object' },
                  ipAddress: { type: 'string' },
                  createdAt: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                page: { type: 'integer' },
                limit: { type: 'integer' },
                total: { type: 'integer' },
                totalPages: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }, async function(request, reply) {
    try {
      const { page = 1, limit = 20, action, userId } = request.query;
      const tenantId = request.user.tenantId;

      // Build query
      const query = { tenant: tenantId };
      
      if (action) {
        query.action = action;
      }
      
      if (userId) {
        query.user = userId;
      }

      // Calculate skip
      const skip = (page - 1) * limit;

      // Get total count
      const total = await ActivityLog.countDocuments(query);

      // Get activities
      const activities = await ActivityLog.find(query)
        .populate('user', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Format response
      const formattedActivities = activities.map(activity => ({
        id: activity._id.toString(),
        user: activity.user ? {
          id: activity.user._id.toString(),
          firstName: activity.user.firstName,
          lastName: activity.user.lastName,
          email: activity.user.email
        } : null,
        action: activity.action,
        description: activity.description,
        metadata: activity.metadata || {},
        ipAddress: activity.ipAddress,
        createdAt: activity.createdAt
      }));

      return reply.send({
        activities: formattedActivities,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch activities', message: error.message });
    }
  });

  // GET /activities/recent - Get recent activities (simpler version for dashboard)
  fastify.get('/activities/recent', {
    preHandler: [tenantContext, authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenantId: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 }
        },
        required: ['tenantId']
      }
    }
  }, async function(request, reply) {
    try {
      const { limit = 10 } = request.query;
      const tenantId = request.tenantId;

      const activities = await ActivityLog.find({ tenant: tenantId })
        .populate('user', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      const formattedActivities = activities.map(activity => ({
        id: activity._id.toString(),
        user: activity.user ? {
          id: activity.user._id.toString(),
          firstName: activity.user.firstName,
          lastName: activity.user.lastName,
          email: activity.user.email
        } : null,
        action: activity.action,
        description: activity.description,
        metadata: activity.metadata || {},
        createdAt: activity.createdAt
      }));

      return reply.send({ activities: formattedActivities });
    } catch (error) {
      fastify.log.error(error);
      return reply.code(500).send({ error: 'Failed to fetch recent activities', message: error.message });
    }
  });
}

module.exports = activityRoutes;
