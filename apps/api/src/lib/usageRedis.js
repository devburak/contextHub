const upstashClient = require('./upstash');
const localRedisClient = require('./localRedis');

const PROVIDER = (process.env.API_USAGE_REDIS_PROVIDER || 'upstash').toLowerCase();
const SUPPORTED = new Set(['upstash', 'local']);
let lastWarningAt = 0;

function warnThrottled(message) {
  const now = Date.now();
  if (now - lastWarningAt > 60000) {
    console.warn(message);
    lastWarningAt = now;
  }
}

function resolveProvider() {
  if (!SUPPORTED.has(PROVIDER)) {
    warnThrottled(`[UsageRedis] Unsupported provider: ${PROVIDER}. Expected one of: upstash, local.`);
    return null;
  }

  if (PROVIDER === 'local') {
    if (!localRedisClient.isEnabled()) {
      warnThrottled('[UsageRedis] Local Redis not enabled; usage logging is disabled.');
      return null;
    }
    return { name: 'local', client: localRedisClient.getClient() };
  }

  if (!upstashClient.isEnabled()) {
    warnThrottled('[UsageRedis] Upstash not enabled; usage logging is disabled.');
    return null;
  }

  return { name: 'upstash', client: upstashClient.getClient() };
}

function getProviderName() {
  return PROVIDER;
}

function isEnabled() {
  return !!resolveProvider();
}

async function incr(key, ttlSeconds) {
  const provider = resolveProvider();
  if (!provider) {
    return null;
  }

  const newValue = await provider.client.incr(key);
  if (ttlSeconds && Number(newValue) === 1) {
    await provider.client.expire(key, ttlSeconds);
  }
  return Number(newValue);
}

async function get(key) {
  const provider = resolveProvider();
  if (!provider) {
    return null;
  }

  const value = await provider.client.get(key);
  if (value === null || value === undefined) {
    return null;
  }

  return parseInt(String(value), 10);
}

async function del(key) {
  const provider = resolveProvider();
  if (!provider) {
    return null;
  }

  return provider.client.del(key);
}

module.exports = {
  getProviderName,
  isEnabled,
  incr,
  get,
  del,
};
