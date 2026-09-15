const localRedisClient = require('../lib/localRedis');
const { getFourHourPeriod, USAGE_KEY_TTL_SECONDS } = require('../services/apiUsageService');
const { ApiToken } = require('@contexthub/common');

const fallbackLastUsed = new Map();
const FALLBACK_INTERVAL_MS = 5 * 60 * 1000;

function recordWithoutRedis(tokenId, now) {
  if (!tokenId) return;
  const lastAttempt = fallbackLastUsed.get(tokenId) || 0;
  if (now.getTime() - lastAttempt < FALLBACK_INTERVAL_MS) return;
  fallbackLastUsed.set(tokenId, now.getTime());
  if (fallbackLastUsed.size > 10000) {
    for (const [id, timestamp] of fallbackLastUsed) {
      if (now.getTime() - timestamp >= FALLBACK_INTERVAL_MS) fallbackLastUsed.delete(id);
    }
  }
  ApiToken.updateOne({ _id: tokenId }, { $max: { lastUsedAt: now } }).catch((error) => {
    fallbackLastUsed.delete(tokenId);
    console.error('[ApiLogger] Failed to record token use without Redis:', error.message);
  });
}

async function apiLogger(request) {
  const skipPaths = ['/health', '/favicon.ico', '/robots.txt'];
  if (skipPaths.some(path => request.url.startsWith(path))) {
    return;
  }

  if (request.requestLimitExceeded) {
    return;
  }

  try {
    const tenantId = request.tenantId || request.user?.tenantId || null;
    if (!tenantId) {
      return;
    }

    const now = new Date();
    const { periodKey } = getFourHourPeriod(now);
    const tokenId = request.apiTokenUsageAuthorized ? request.apiToken?._id?.toString?.() : null;

    setImmediate(() => {
      if (!localRedisClient.isEnabled()) {
        recordWithoutRedis(tokenId, now);
        return;
      }
      localRedisClient.incrementUsageCounter(tenantId, periodKey, USAGE_KEY_TTL_SECONDS, tokenId).then((count) => {
        if (count === null) recordWithoutRedis(tokenId, now);
      }).catch((error) => {
        console.error('[ApiLogger] Failed to increment usage counter:', error.message);
        recordWithoutRedis(tokenId, now);
      });
    });
  } catch (error) {
    console.error('[ApiLogger] Error:', error.message);
  }
}

module.exports = apiLogger;
