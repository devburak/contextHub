const localRedisClient = require('../lib/localRedis');
const { getFourHourPeriod, USAGE_KEY_TTL_SECONDS } = require('../services/apiUsageService');

async function apiLogger(request) {
  const skipPaths = ['/health', '/favicon.ico', '/robots.txt'];
  if (skipPaths.some(path => request.url.startsWith(path))) {
    return;
  }

  if (request.requestLimitExceeded) {
    return;
  }

  if (!localRedisClient.isEnabled()) {
    return;
  }

  try {
    const tenantId = request.tenantId || request.user?.tenantId || null;
    if (!tenantId) {
      return;
    }

    const { periodKey } = getFourHourPeriod(new Date());

    setImmediate(() => {
      localRedisClient.incrementUsageCounter(tenantId, periodKey, USAGE_KEY_TTL_SECONDS).catch((error) => {
        console.error('[ApiLogger] Failed to increment usage counter:', error.message);
      });
    });
  } catch (error) {
    console.error('[ApiLogger] Error:', error.message);
  }
}

module.exports = apiLogger;
