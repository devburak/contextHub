const localRedisClient = require('../lib/localRedis');

const RATE_LIMIT_SCRIPT = `
  local key = KEYS[1]
  local timeWindow = tonumber(ARGV[1])
  local max = tonumber(ARGV[2])
  local ban = tonumber(ARGV[3])
  local continueExceeding = ARGV[4] == 'true'

  local current = redis.call('INCR', key)
  local ttl = redis.call('PTTL', key)

  if ttl == -1 or (continueExceeding and current > max) then
    redis.call('PEXPIRE', key, timeWindow)
    ttl = timeWindow
  end

  return {current, ttl, ban ~= -1 and current - max > ban}
`;

const WARNING_INTERVAL_MS = 60 * 1000;
let lastWarningAt = 0;

function warnUnavailable(error) {
  const now = Date.now();
  if (now - lastWarningAt < WARNING_INTERVAL_MS) {
    return;
  }

  lastWarningAt = now;
  // Do not log the limiter key: it may contain a client IP address.
  // eslint-disable-next-line no-console
  console.warn(
    `[RateLimit] Shared Redis store unavailable; limiter is temporarily fail-open: ${error.message}`
  );
}

function routeNamespace(routeOptions) {
  const method = routeOptions.routeInfo?.method || 'route';
  const url = routeOptions.routeInfo?.url || 'unknown';
  return `rate-limit:route:${encodeURIComponent(String(method))}:${encodeURIComponent(String(url))}:`;
}

class RedisRateLimitStore {
  constructor(options = {}, redisProvider = localRedisClient, namespace = 'rate-limit:global:') {
    this.timeWindow = options.timeWindow;
    this.continueExceeding = Boolean(options.continueExceeding);
    this.redisProvider = redisProvider;
    this.namespace = namespace;
  }

  async incr(key, callback, max, ban) {
    if (!this.redisProvider.isEnabled()) {
      const error = new Error('Redis is not connected');
      warnUnavailable(error);
      callback(error, null);
      return;
    }

    let result;
    try {
      const client = this.redisProvider.getClient();
      result = await client.eval(RATE_LIMIT_SCRIPT, {
        keys: [`${this.namespace}${key}`],
        arguments: [
          String(this.timeWindow),
          String(max),
          String(ban),
          String(this.continueExceeding),
        ],
      });

      if (!Array.isArray(result) || result.length < 3) {
        throw new Error('Redis returned an invalid rate-limit result');
      }
    } catch (error) {
      warnUnavailable(error);
      callback(error, null);
      return;
    }

    callback(null, {
      current: Number(result[0]),
      ttl: Number(result[1]),
      ban: Boolean(Number(result[2])),
    });
  }

  child(routeOptions) {
    return new RedisRateLimitStore(
      routeOptions,
      this.redisProvider,
      routeNamespace(routeOptions)
    );
  }
}

module.exports = RedisRateLimitStore;
module.exports.RATE_LIMIT_SCRIPT = RATE_LIMIT_SCRIPT;
