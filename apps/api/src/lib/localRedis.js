const Redis = require('redis');

/**
 * Local Redis Client for Limit Caching
 * Used for fast limit checks without hitting MongoDB on every request
 */
class LocalRedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.isInitialized = false;
  }

  /**
   * Initialize the Redis client
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      const host = process.env.REDIS_HOST || '127.0.0.1';
      const port = process.env.REDIS_PORT || 6379;

      console.log(`[LocalRedis] Connecting to ${host}:${port}...`);

      this.client = Redis.createClient({
        socket: {
          host,
          port: Number(port),
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              console.error('[LocalRedis] Max retries reached, giving up');
              return new Error('Max retries reached');
            }
            return retries * 100;
          },
        },
      });

      this.client.on('error', (err) => {
        console.error('[LocalRedis] Error:', err.message);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        console.log('[LocalRedis] Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('[LocalRedis] Ready');
      });

      await this.client.connect();
      this.isInitialized = true;
      
      console.log('[LocalRedis] Initialized successfully');
    } catch (error) {
      console.error('[LocalRedis] Failed to initialize:', error.message);
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is enabled and connected
   */
  isEnabled() {
    return this.isConnected && this.client !== null;
  }

  /**
   * Get the Redis client (for direct operations)
   */
  getClient() {
    return this.client;
  }

  // === LIMIT CACHE OPERATIONS ===

  /**
   * Cache tenant limit data
   * @param {string} tenantId - Tenant ID
   * @param {object} limits - Limit data { userLimit, storageLimit, monthlyRequestLimit }
   * @param {number} ttl - TTL in seconds (default: 24 hours)
   */
  async cacheTenantLimits(tenantId, limits, ttl = 86400) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const key = `limit:tenant:${tenantId}:config`;
      await this.client.set(key, JSON.stringify(limits), { EX: ttl });
      console.log(`[LocalRedis] Cached limits for tenant ${tenantId}`);
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to cache tenant limits:', error.message);
      return false;
    }
  }

  /**
   * Get cached tenant limits
   * @param {string} tenantId - Tenant ID
   * @returns {object|null} - Limit data or null if not cached
   */
  async getTenantLimits(tenantId) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const key = `limit:tenant:${tenantId}:config`;
      const data = await this.client.get(key);
      
      if (!data) {
        return null;
      }
      
      return JSON.parse(data);
    } catch (error) {
      console.error('[LocalRedis] Failed to get tenant limits:', error.message);
      return null;
    }
  }

  /**
   * Cache tenant's remaining request quota
   * @param {string} tenantId - Tenant ID
   * @param {number} remaining - Remaining requests for current billing cycle
   * @param {number} ttl - TTL in seconds (default: 24 hours)
   */
  async cacheRequestQuota(tenantId, remaining, ttl = 86400) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const key = `limit:tenant:${tenantId}:requests:remaining`;
      await this.client.set(key, remaining.toString(), { EX: ttl });
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to cache request quota:', error.message);
      return false;
    }
  }

  /**
   * Get cached request quota
   * @param {string} tenantId - Tenant ID
   * @returns {number|null} - Remaining requests or null if not cached
   */
  async getRequestQuota(tenantId) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const key = `limit:tenant:${tenantId}:requests:remaining`;
      const value = await this.client.get(key);
      
      if (value === null) {
        return null;
      }
      
      return parseInt(value, 10);
    } catch (error) {
      console.error('[LocalRedis] Failed to get request quota:', error.message);
      return null;
    }
  }

  /**
   * Decrement request quota (atomic operation)
   * @param {string} tenantId - Tenant ID
   * @returns {number} - New remaining count
   */
  async decrementRequestQuota(tenantId) {
    if (!this.isEnabled()) {
      return -1;
    }

    try {
      const key = `limit:tenant:${tenantId}:requests:remaining`;
      const newValue = await this.client.decr(key);
      return newValue;
    } catch (error) {
      console.error('[LocalRedis] Failed to decrement request quota:', error.message);
      return -1;
    }
  }

  /**
   * Cache tenant's current storage usage
   * @param {string} tenantId - Tenant ID
   * @param {number} storageBytes - Current storage in bytes
   * @param {number} ttl - TTL in seconds (default: 1 hour)
   */
  async cacheStorageUsage(tenantId, storageBytes, ttl = 3600) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const key = `limit:tenant:${tenantId}:storage:current`;
      await this.client.set(key, storageBytes.toString(), { EX: ttl });
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to cache storage usage:', error.message);
      return false;
    }
  }

  /**
   * Get cached storage usage
   * @param {string} tenantId - Tenant ID
   * @returns {number|null} - Storage in bytes or null if not cached
   */
  async getStorageUsage(tenantId) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const key = `limit:tenant:${tenantId}:storage:current`;
      const value = await this.client.get(key);
      
      if (value === null) {
        return null;
      }
      
      return parseInt(value, 10);
    } catch (error) {
      console.error('[LocalRedis] Failed to get storage usage:', error.message);
      return null;
    }
  }

  /**
   * Invalidate all cache for a tenant
   * @param {string} tenantId - Tenant ID
   */
  async invalidateTenantCache(tenantId) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const pattern = `limit:tenant:${tenantId}:*`;
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`[LocalRedis] Invalidated ${keys.length} keys for tenant ${tenantId}`);
      }
      
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to invalidate tenant cache:', error.message);
      return false;
    }
  }

  /**
   * Set request limit exceeded flag for a tenant
   * @param {string} tenantId - Tenant ID
   * @param {object} payload - Flag payload
   */
  async setRequestLimitFlag(tenantId, payload) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const key = `limit:tenant:${tenantId}:requests:exceeded`;
      await this.client.set(key, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to set request limit flag:', error.message);
      return false;
    }
  }

  /**
   * Get request limit exceeded flag for a tenant
   * @param {string} tenantId - Tenant ID
   * @returns {object|null}
   */
  async getRequestLimitFlag(tenantId) {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      const key = `limit:tenant:${tenantId}:requests:exceeded`;
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('[LocalRedis] Failed to get request limit flag:', error.message);
      return null;
    }
  }

  /**
   * Clear request limit exceeded flag for a tenant
   * @param {string} tenantId - Tenant ID
   */
  async clearRequestLimitFlag(tenantId) {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      const key = `limit:tenant:${tenantId}:requests:exceeded`;
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('[LocalRedis] Failed to clear request limit flag:', error.message);
      return false;
    }
  }

  /**
   * Cleanup legacy API log keys
   * @param {object} options
   */
  async cleanupLegacyLogs(options = {}) {
    if (!this.isEnabled()) {
      return { deleted: 0, skipped: true };
    }

    const patterns = options.patterns || ['api:log:*', 'api:endpoint:*'];
    const count = options.count || 500;
    const maxKeys = options.maxKeys || 5000;

    let deleted = 0;

    try {
      for (const pattern of patterns) {
        const iterator = this.client.scanIterator({ MATCH: pattern, COUNT: count });
        for await (const key of iterator) {
          if (Array.isArray(key)) {
            if (key.length === 0) {
              continue;
            }
            await this.client.del(...key);
            deleted += key.length;
          } else if (key) {
            await this.client.del(key);
            deleted += 1;
          }
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

  /**
   * Close the Redis connection
   */
  async close() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      this.isInitialized = false;
      console.log('[LocalRedis] Connection closed');
    }
  }
}

// Export singleton instance
const localRedisClient = new LocalRedisClient();
module.exports = localRedisClient;
