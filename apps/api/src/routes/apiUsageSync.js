const apiUsageSyncService = require('../services/apiUsageSyncService');
const usageRedis = require('../lib/usageRedis');

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

  fastify.post('/api-usage-sync/trigger', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          includeCurrent: { type: 'boolean' },
          force: { type: 'boolean' },
        },
      },
    },
  }, async function triggerSyncHandler(request, reply) {
    try {
      const includeCurrent = request.query.includeCurrent !== false && request.query.includeCurrent !== 'false';
      const result = await apiUsageSyncService.runScheduledSync({
        includeCurrent,
        force: request.query.force === true || request.query.force === 'true',
      });

      return reply.send({
        success: true,
        ...result,
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to trigger usage sync');
      return reply.code(500).send({
        success: false,
        error: 'SyncFailed',
        message: error.message,
      });
    }
  });

  fastify.post('/api-usage-sync/fourhour', {}, async function fourHourSyncHandler(request, reply) {
    try {
      const includeCurrent = request.query?.includeCurrent !== false && request.query?.includeCurrent !== 'false';
      const result = await apiUsageSyncService.syncFourHourUsage({ includeCurrent });
      return reply.send(result);
    } catch (error) {
      request.log.error({ err: error }, 'Failed to sync 4-hour usage');
      return reply.code(500).send({
        success: false,
        error: 'FourHourSyncFailed',
        message: error.message,
      });
    }
  });

  fastify.post('/api-usage-sync/halfday', {}, async function halfDayAliasHandler(request, reply) {
    try {
      const includeCurrent = request.query?.includeCurrent !== false && request.query?.includeCurrent !== 'false';
      const result = await apiUsageSyncService.syncFourHourUsage({ includeCurrent });
      return reply.send({
        ...result,
        deprecatedAlias: 'halfday',
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to sync usage via halfday alias');
      return reply.code(500).send({
        success: false,
        error: 'HalfDaySyncFailed',
        message: error.message,
      });
    }
  });

  fastify.post('/api-usage-sync/daily', {}, async function dailyAliasHandler(request, reply) {
    try {
      const result = await apiUsageSyncService.syncFourHourUsage({ includeCurrent: true });
      return reply.send({
        ...result,
        deprecatedAlias: 'daily',
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to sync usage via daily alias');
      return reply.code(500).send({
        success: false,
        error: 'DailySyncFailed',
        message: error.message,
      });
    }
  });

  fastify.post('/api-usage-sync/weekly', {}, async function weeklyAliasHandler(request, reply) {
    try {
      const result = await apiUsageSyncService.syncFourHourUsage({ includeCurrent: true });
      return reply.send({
        ...result,
        deprecatedAlias: 'weekly',
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to sync usage via weekly alias');
      return reply.code(500).send({
        success: false,
        error: 'WeeklySyncFailed',
        message: error.message,
      });
    }
  });

  fastify.post('/api-usage-sync/monthly', {}, async function monthlyAliasHandler(request, reply) {
    try {
      const result = await apiUsageSyncService.syncFourHourUsage({ includeCurrent: true });
      return reply.send({
        ...result,
        deprecatedAlias: 'monthly',
      });
    } catch (error) {
      request.log.error({ err: error }, 'Failed to sync usage via monthly alias');
      return reply.code(500).send({
        success: false,
        error: 'MonthlySyncFailed',
        message: error.message,
      });
    }
  });

  fastify.get('/api-usage-sync/status', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            usageRedisEnabled: { type: 'boolean' },
            period: { type: 'string' },
          },
        },
      },
    },
  }, async function statusHandler(request, reply) {
    try {
      return reply.send({
        provider: usageRedis.getProviderName(),
        usageRedisEnabled: usageRedis.isEnabled(),
        period: '4hour',
        message: 'API Usage Sync Service is running',
        endpoints: {
          trigger: 'POST /api-usage-sync/trigger - Safe to call at any time, syncs closed periods and the current partial period',
          fourhour: 'POST /api-usage-sync/fourhour - Force a 4-hour usage sync',
          halfday: 'POST /api-usage-sync/halfday - Deprecated alias for 4-hour sync',
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
