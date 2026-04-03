const localRedisClient = require('./localRedis');

function getProviderName() {
  return 'local';
}

function isEnabled() {
  return localRedisClient.isEnabled();
}

function getClient() {
  return localRedisClient.getClient();
}

async function incr(key, ttlSeconds) {
  if (!isEnabled()) {
    return null;
  }

  const value = await localRedisClient.getClient().incr(key);
  if (ttlSeconds && Number(value) === 1) {
    await localRedisClient.getClient().expire(key, ttlSeconds);
  }
  return Number(value);
}

async function get(key) {
  if (!isEnabled()) {
    return null;
  }

  return localRedisClient.getClient().get(key);
}

async function del(key) {
  if (!isEnabled()) {
    return null;
  }

  return localRedisClient.getClient().del(key);
}

module.exports = {
  getProviderName,
  isEnabled,
  getClient,
  incr,
  get,
  del,
  incrementUsageCounter: (...args) => localRedisClient.incrementUsageCounter(...args),
  getUsageCounter: (...args) => localRedisClient.getUsageCounter(...args),
  setUsageFlushedCount: (...args) => localRedisClient.setUsageFlushedCount(...args),
  deleteUsageCounter: (...args) => localRedisClient.deleteUsageCounter(...args),
  acquireLock: (...args) => localRedisClient.acquireLock(...args),
  releaseLock: (...args) => localRedisClient.releaseLock(...args),
};
