const apiUsageSyncService = require('../services/apiUsageSyncService');

/**
 * API Usage Sync Routes
 * Endpoints to manually trigger data sync from Redis to MongoDB
 */
async function apiUsageSyncRoutes(fastify) {
  function requireCronSecret(request, reply, done) {
    const secretToken = process.env.CRON_SECRET_TOKEN;

    if (!secretToken) {
      if (process.env.NODE_ENV === 'production') {
        return reply.code(500).send({
          error: 'CronSecretMissing',
          message: 'CRON_SECRET_TOKEN is not configured',
        });
      }
      return done();
    }

    const providedToken = request.headers['x-cron-secret'];
    if (!providedToken || providedToken !== secretToken) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or missing cron secret token',
      });
    }

    done();
  }

  fastify.addHook('preHandler', requireCronSecret);
  
  /**
   * POST /api-usage-sync/trigger
   * Manually trigger scheduled sync (half-day)
   *
   * This endpoint should be called by external cron service at 00:00 and 12:00 UTC
   */
  fastify.post('/api-usage-sync/trigger', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          force: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            timestamp: { type: 'string' },
            executed: { type: 'array' },
          },
        },
      },
    },
  }, async function triggerSyncHandler(request, reply) {
    try {
      console.log('[API] Sync triggered manually');
      
      const result = await apiUsageSyncService.runScheduledSync({
        force: request.query.force === true || request.query.force === 'true',
      });
      
      return reply.send({
        success: true,
        ...result,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to trigger sync');
      return reply.code(500).send({
        success: false,
        error: 'SyncFailed',
        message: error.message,
      });
    }
  });

  /**
   * POST /api-usage-sync/halfday
   * Manually trigger half-day sync
   */
  fastify.post('/api-usage-sync/halfday', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
  }, async function halfDaySyncHandler(request, reply) {
    try {
      console.log('[API] Half-day sync triggered manually');
      
      const result = await apiUsageSyncService.syncHalfDayUsage();
      
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to sync half-day usage');
      return reply.code(500).send({
        success: false,
        error: 'HalfDaySyncFailed',
        message: error.message,
      });
    }
  });

  /**
   * POST /api-usage-sync/daily
   * Deprecated: alias for half-day sync
   */
  fastify.post('/api-usage-sync/daily', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
  }, async function dailySyncHandler(request, reply) {
    try {
      console.log('[API] Daily sync (deprecated) triggered manually');

      const result = await apiUsageSyncService.syncHalfDayUsage();
      
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to sync daily usage');
      return reply.code(500).send({
        success: false,
        error: 'DailySyncFailed',
        message: error.message,
      });
    }
  });

  /**
   * POST /api-usage-sync/weekly
   * Deprecated: alias for half-day sync
   */
  fastify.post('/api-usage-sync/weekly', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
  }, async function weeklySyncHandler(request, reply) {
    try {
      console.log('[API] Weekly sync (deprecated) triggered manually');

      const result = await apiUsageSyncService.syncHalfDayUsage();
      
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to sync weekly usage');
      return reply.code(500).send({
        success: false,
        error: 'WeeklySyncFailed',
        message: error.message,
      });
    }
  });

  /**
   * POST /api-usage-sync/monthly
   * Deprecated: alias for half-day sync
   */
  fastify.post('/api-usage-sync/monthly', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
          },
        },
      },
    },
  }, async function monthlySyncHandler(request, reply) {
    try {
      console.log('[API] Monthly sync (deprecated) triggered manually');

      const result = await apiUsageSyncService.syncHalfDayUsage();

      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to sync monthly usage');
      return reply.code(500).send({
        success: false,
        error: 'MonthlySyncFailed',
        message: error.message,
      });
    }
  });

  /**
   * GET /api-usage-sync/status
   * Get sync service status
   */
  fastify.get('/api-usage-sync/status', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            usageRedisEnabled: { type: 'boolean' },
            lastSync: { type: 'object' },
          },
        },
      },
    },
  }, async function statusHandler(request, reply) {
    try {
      const usageRedis = require('../lib/usageRedis');
      
      return reply.send({
        provider: usageRedis.getProviderName(),
        usageRedisEnabled: usageRedis.isEnabled(),
        message: 'API Usage Sync Service is running',
        endpoints: {
          trigger: 'POST /api-usage-sync/trigger - Run scheduled sync (half-day)',
          halfday: 'POST /api-usage-sync/halfday - Force half-day sync',
          daily: 'POST /api-usage-sync/daily - Deprecated alias for half-day sync',
          weekly: 'POST /api-usage-sync/weekly - Deprecated alias for half-day sync',
          monthly: 'POST /api-usage-sync/monthly - Deprecated alias for half-day sync',
        },
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to get sync status');
      return reply.code(500).send({
        error: 'StatusFailed',
        message: error.message,
      });
    }
  });
}

module.exports = apiUsageSyncRoutes;
