const crypto = require('crypto');
const { EventEmitter } = require('events');
const Redis = require('redis');

const DEFAULT_USAGE_KEY_TTL_SECONDS = 45 * 24 * 60 * 60;
const DEFAULT_LIMIT_KEY_TTL_SECONDS = 40 * 24 * 60 * 60;

function getCurrentMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function parseInteger(value, fallback = 0) {
  const parsed = parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

class LocalRedisClient extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.isConnected = false;
    this.isInitialized = false;
    this.connectPromise = null;
    this.hasEverBeenReady = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.connectPromise;
    }

    const host = process.env.REDIS_HOST || '127.0.0.1';
    const port = process.env.REDIS_PORT || 6379;

    console.log(`[LocalRedis] Connecting to ${host}:${port}...`);

    this.client = Redis.createClient({
      socket: {
        host,
        port: Number(port),
        reconnectStrategy: (retries) => Math.min(5000, Math.max(250, retries * 250)),
      },
    });
    this.isInitialized = true;

    this.client.on('error', (err) => {
      console.error('[LocalRedis] Error:', err.message);
      this.isConnected = false;
      this.emit('clientError', err);
    });

    this.client.on('connect', () => {
      console.log('[LocalRedis] Connected');
    });

    this.client.on('ready', () => {
      const reconnected = this.hasEverBeenReady;
      this.isConnected = true;
      this.hasEverBeenReady = true;
      console.log('[LocalRedis] Ready');
      this.emit('ready', { reconnected });
    });

    this.client.on('end', () => {
      console.warn('[LocalRedis] Connection ended');
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.connectPromise = this.client.connect().catch((error) => {
      console.error('[LocalRedis] Initial connect failed:', error.message);
      return null;
    });

    return this.connectPromise;
  }

  isEnabled() {
    return this.isConnected && this.client !== null;
  }

  getClient() {
    return this.client;
  }

  getTenantLimitsKey(tenantId) {
    return `limit:tenant:${tenantId}:config`;
  }

  getRequestQuotaKey(tenantId, cycleKey = getCurrentMonthKey()) {
    return `limit:tenant:${tenantId}:requests:remaining:${cycleKey}`;
  }

  getRequestLimitFlagKey(tenantId, cycleKey = getCurrentMonthKey()) {
    return `limit:tenant:${tenantId}:requests:exceeded:${cycleKey}`;
  }

  getStorageUsageKey(tenantId) {
    return `limit:tenant:${tenantId}:storage:current`;
  }

  getUsageCounterKey(tenantId, periodKey) {
    return `usage:requests:${tenantId}:${periodKey}`;
  }

  async cacheTenantLimits(tenantId, limits, ttl = 86400) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      await this.client.set(this.getTenantLimitsKey(tenantId), JSON.stringify(limits), { EX: ttl });
      console.log(`[LocalRedis] Cached limits for tenant ${tenantId}`);
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to cache tenant limits:', error.message);
      return false;
    }
  }

  async getTenantLimits(tenantId) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const data = await this.client.get(this.getTenantLimitsKey(tenantId));
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[LocalRedis] Failed to get tenant limits:', error.message);
      return null;
    }
  }

  async cacheRequestQuota(tenantId, remaining, ttl = DEFAULT_LIMIT_KEY_TTL_SECONDS, cycleKey = getCurrentMonthKey()) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      await this.client.set(this.getRequestQuotaKey(tenantId, cycleKey), String(remaining), { EX: ttl });
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to cache request quota:', error.message);
      return false;
    }
  }

  async getRequestQuota(tenantId, cycleKey = getCurrentMonthKey()) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const value = await this.client.get(this.getRequestQuotaKey(tenantId, cycleKey));
      if (value === null) {
        return null;
      }
      return parseInteger(value, null);
    } catch (error) {
      console.error('[LocalRedis] Failed to get request quota:', error.message);
      return null;
    }
  }

  async decrementRequestQuota(tenantId, cycleKey = getCurrentMonthKey()) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      return await this.client.decr(this.getRequestQuotaKey(tenantId, cycleKey));
    } catch (error) {
      console.error('[LocalRedis] Failed to decrement request quota:', error.message);
      return null;
    }
  }

  async incrementRequestQuota(tenantId, cycleKey = getCurrentMonthKey()) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      return await this.client.incr(this.getRequestQuotaKey(tenantId, cycleKey));
    } catch (error) {
      console.error('[LocalRedis] Failed to increment request quota:', error.message);
      return null;
    }
  }

  async clearRequestQuota(tenantId, cycleKey = getCurrentMonthKey()) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      await this.client.del(this.getRequestQuotaKey(tenantId, cycleKey));
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to clear request quota:', error.message);
      return false;
    }
  }

  async cacheStorageUsage(tenantId, storageBytes, ttl = 3600) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      await this.client.set(this.getStorageUsageKey(tenantId), String(storageBytes), { EX: ttl });
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to cache storage usage:', error.message);
      return false;
    }
  }

  async getStorageUsage(tenantId) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const value = await this.client.get(this.getStorageUsageKey(tenantId));
      if (value === null) {
        return null;
      }
      return parseInteger(value, null);
    } catch (error) {
      console.error('[LocalRedis] Failed to get storage usage:', error.message);
      return null;
    }
  }

  async invalidateTenantCache(tenantId) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const pattern = `limit:tenant:${tenantId}:*`;
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
        console.log(`[LocalRedis] Invalidated ${keys.length} keys for tenant ${tenantId}`);
      }
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to invalidate tenant cache:', error.message);
      return false;
    }
  }

  async setRequestLimitFlag(tenantId, payload, ttl = DEFAULT_LIMIT_KEY_TTL_SECONDS, cycleKey = payload?.periodKey || getCurrentMonthKey()) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      await this.client.set(this.getRequestLimitFlagKey(tenantId, cycleKey), JSON.stringify(payload), { EX: ttl });
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to set request limit flag:', error.message);
      return false;
    }
  }

  async getRequestLimitFlag(tenantId, cycleKey = getCurrentMonthKey()) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const value = await this.client.get(this.getRequestLimitFlagKey(tenantId, cycleKey));
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('[LocalRedis] Failed to get request limit flag:', error.message);
      return null;
    }
  }

  async clearRequestLimitFlag(tenantId, cycleKey = getCurrentMonthKey()) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      await this.client.del(this.getRequestLimitFlagKey(tenantId, cycleKey));
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to clear request limit flag:', error.message);
      return false;
    }
  }

  async incrementUsageCounter(tenantId, periodKey, ttl = DEFAULT_USAGE_KEY_TTL_SECONDS) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const key = this.getUsageCounterKey(tenantId, periodKey);
      const now = String(Date.now());
      const replies = await this.client.multi()
        .hIncrBy(key, 'count', 1)
        .hSet(key, {
          periodKey,
          updatedAt: now,
        })
        .expire(key, ttl)
        .exec();

      return parseInteger(Array.isArray(replies) ? replies[0] : 0);
    } catch (error) {
      console.error('[LocalRedis] Failed to increment usage counter:', error.message);
      return null;
    }
  }

  async getUsageCounter(tenantId, periodKey) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const data = await this.client.hGetAll(this.getUsageCounterKey(tenantId, periodKey));
      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      const count = parseInteger(data.count, 0);
      const flushed = parseInteger(data.flushed, 0);

      return {
        count,
        flushed,
        pending: Math.max(0, count - flushed),
        updatedAt: data.updatedAt ? new Date(parseInteger(data.updatedAt, Date.now())) : null,
        flushedAt: data.flushedAt ? new Date(parseInteger(data.flushedAt, Date.now())) : null,
      };
    } catch (error) {
      console.error('[LocalRedis] Failed to get usage counter:', error.message);
      return null;
    }
  }

  async setUsageFlushedCount(tenantId, periodKey, flushedCount, ttl = DEFAULT_USAGE_KEY_TTL_SECONDS) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const key = this.getUsageCounterKey(tenantId, periodKey);
      await this.client.multi()
        .hSet(key, {
          periodKey,
          flushed: String(flushedCount),
          flushedAt: String(Date.now()),
        })
        .expire(key, ttl)
        .exec();
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to set usage flushed count:', error.message);
      return false;
    }
  }

  async deleteUsageCounter(tenantId, periodKey) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      await this.client.del(this.getUsageCounterKey(tenantId, periodKey));
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to delete usage counter:', error.message);
      return false;
    }
  }

  async acquireLock(key, ttlSeconds = 300) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const token = crypto.randomUUID();
      const result = await this.client.set(key, token, { NX: true, EX: ttlSeconds });
      return result === 'OK' ? token : null;
    } catch (error) {
      console.error('[LocalRedis] Failed to acquire lock:', error.message);
      return null;
    }
  }

  async releaseLock(key, token) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const current = await this.client.get(key);
      if (!current || current !== token) {
        return false;
      }
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to release lock:', error.message);
      return false;
    }
  }

  async cleanupLegacyLogs(options = {}) {
    if (!this.isEnabled()) {
      return { deleted: 0, skipped: true };
    }

    const patterns = options.patterns || [
      'api:log:*',
      'api:endpoint:*',
      'api:count:12h:*',
      'api:count:daily:*',
      'api:count:weekly:*',
      'api:count:monthly:*',
    ];
    const count = options.count || 500;
    const maxKeys = options.maxKeys || 5000;
    let deleted = 0;

    try {
      for (const pattern of patterns) {
        const iterator = this.client.scanIterator({ MATCH: pattern, COUNT: count });
        for await (const entry of iterator) {
          const keys = Array.isArray(entry) ? entry.filter(Boolean) : [entry].filter(Boolean);
          if (keys.length === 0) {
            continue;
          }

          await this.client.del(...keys);
          deleted += keys.length;

          if (deleted >= maxKeys) {
            return { deleted, capped: true };
          }
        }
      }
    } catch (error) {
      console.error('[LocalRedis] Failed to cleanup legacy logs:', error.message);
      return { deleted, error: error.message };
    }

    return { deleted };
  }

  async close() {
    if (!this.client) {
      return;
    }

    try {
      await this.client.quit();
    } catch (error) {
      console.error('[LocalRedis] Failed to close connection:', error.message);
    } finally {
      this.isConnected = false;
      this.isInitialized = false;
      this.connectPromise = null;
      this.hasEverBeenReady = false;
      console.log('[LocalRedis] Connection closed');
    }
  }
}

module.exports = new LocalRedisClient();
