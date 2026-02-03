const usageRedis = require('../lib/usageRedis');
const { getHalfDayPeriod } = require('../services/apiUsageService');

const HALF_DAY_TTL_SECONDS = 60 * 60 * 72; // 72 hours

/**
 * Middleware to log API requests to Upstash Redis
 * Tracks: endpoint, tenantId, userId, IP, timestamp, response time
 * 
 * This runs on onResponse hook to ensure tenantContext has already set request.tenantId
 */
async function apiLogger(request, reply) {
  // Skip logging for health check and static files
  const skipPaths = ['/health', '/favicon.ico', '/robots.txt'];
  if (skipPaths.some(path => request.url.startsWith(path))) {
    return;
  }

  // Skip if usage logging is disabled
  if (!usageRedis.isEnabled()) {
    return;
  }

  try {
    const tenantId = request.tenantId || request.user?.tenantId || null;
    const normalizedTenantId = tenantId || 'system';
    const { periodKey } = getHalfDayPeriod(new Date());
    const key = `api:count:12h:${normalizedTenantId}:${periodKey}`;

    // Log to Redis asynchronously (don't block response)
    setImmediate(() => {
      usageRedis.incr(key, HALF_DAY_TTL_SECONDS).catch(error => {
        console.error('Failed to log API usage:', error);
      });
    });
  } catch (error) {
    console.error('[APILogger] Error in apiLogger:', error);
  }
}

module.exports = apiLogger;
