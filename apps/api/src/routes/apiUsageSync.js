const apiUsageSyncService = require('../services/apiUsageSyncService');

/**
 * API Usage Sync Routes
 * Endpoints to manually trigger data sync from Redis to MongoDB
 */
async function apiUsageSyncRoutes(fastify) {
  
  /**
   * POST /api-usage-sync/trigger
   * Manually trigger scheduled sync (daily, weekly, monthly based on current date)
   * 
   * This endpoint should be called by external cron service daily at 00:00
   */
  fastify.post('/api-usage-sync/trigger', {
    schema: {
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
      
      const result = await apiUsageSyncService.runScheduledSync();
      
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
   * POST /api-usage-sync/daily
   * Manually trigger daily sync
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
      console.log('[API] Daily sync triggered manually');
      
      const result = await apiUsageSyncService.syncDailyUsage();
      
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
   * Manually trigger weekly sync
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
      console.log('[API] Weekly sync triggered manually');
      
      const result = await apiUsageSyncService.syncWeeklyUsage();
      
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
   * Manually trigger monthly sync
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
      console.log('[API] Monthly sync triggered manually');
      
      const result = await apiUsageSyncService.syncMonthlyUsage();
      
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
            upstashEnabled: { type: 'boolean' },
            lastSync: { type: 'object' },
          },
        },
      },
    },
  }, async function statusHandler(request, reply) {
    try {
      const upstashClient = require('../lib/upstash');
      
      return reply.send({
        upstashEnabled: upstashClient.isEnabled(),
        message: 'API Usage Sync Service is running',
        endpoints: {
          trigger: 'POST /api-usage-sync/trigger - Run scheduled sync (daily/weekly/monthly)',
          daily: 'POST /api-usage-sync/daily - Force daily sync',
          weekly: 'POST /api-usage-sync/weekly - Force weekly sync',
          monthly: 'POST /api-usage-sync/monthly - Force monthly sync',
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
