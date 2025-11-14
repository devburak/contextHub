const { Redis } = require('@upstash/redis');
const { Agent } = require('undici');

const CONNECT_TIMEOUT_MS = parseInt(process.env.UPSTASH_CONNECT_TIMEOUT_MS, 10) || 20000;
const RETRY_ATTEMPTS = parseInt(process.env.UPSTASH_RETRY_ATTEMPTS, 10) || 3;
const RETRY_BASE_DELAY_MS = parseInt(process.env.UPSTASH_RETRY_DELAY_MS, 10) || 250;
const RETRY_MAX_DELAY_MS = parseInt(process.env.UPSTASH_RETRY_MAX_DELAY_MS, 10) || 4000;
const FAILURE_THRESHOLD = parseInt(process.env.UPSTASH_MAX_FAILURES, 10) || 5;
const FAILURE_COOLDOWN_MS = parseInt(process.env.UPSTASH_FAILURE_COOLDOWN_MS, 10) || (5 * 60 * 1000);
const VERBOSE_LOGGING = (process.env.UPSTASH_VERBOSE_LOGGING || 'false').toLowerCase() === 'true';

function verboseLog(message, payload) {
  if (!VERBOSE_LOGGING) {
    return;
  }
  if (payload !== undefined) {
    console.log(message, payload);
  } else {
    console.log(message);
  }
}

/**
 * Upstash Redis client for API analytics
 */
class UpstashClient {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.initialized = false;
    this.agent = null;
    this.consecutiveFailures = 0;
    this.cooldownUntil = 0;
    this.lastCooldownLogAt = 0;
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    const token = process.env.UPSTASH_TOKEN;
    const endpoint = process.env.UPSTASH_ENDPOINT;

    verboseLog('Upstash initialization:', {
      hasToken: !!token,
      hasEndpoint: !!endpoint,
      endpoint: endpoint || 'not set'
    });

    if (!token || !endpoint) {
      console.warn('Upstash credentials not configured. API analytics will be disabled.');
      return;
    }

    try {
      this.agent = new Agent({
        connect: { timeout: CONNECT_TIMEOUT_MS },
        keepAliveTimeout: 60_000,
        keepAliveMaxTimeout: 120_000
      });

      this.client = new Redis({
        url: endpoint,
        token: token,
        agent: this.agent,
        retry: RETRY_ATTEMPTS > 0
          ? {
              retries: RETRY_ATTEMPTS,
              backoff: (retryCount) => Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * Math.pow(2, retryCount))
            }
          : false,
        keepAlive: true,
        enableAutoPipelining: true
      });
      this.enabled = true;
  verboseLog('Upstash Redis client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Upstash Redis client:', error);
      this.enabled = false;
    }
  }

  /**
   * Check if Upstash is enabled and ready
   */
  isEnabled() {
    if (!this.initialized) {
      this.initialize();
    }
    if (!this.enabled || !this.client) {
      return false;
    }

    if (this.cooldownUntil && Date.now() < this.cooldownUntil) {
      if (Date.now() - this.lastCooldownLogAt > 30000) {
        console.warn('[Upstash] Logging temporarily disabled after repeated failures. Retrying automatically soon.');
        this.lastCooldownLogAt = Date.now();
      }
      return false;
    }

    if (this.cooldownUntil && Date.now() >= this.cooldownUntil) {
      console.info('[Upstash] Cooldown expired. Re-enabling logging.');
      this.cooldownUntil = 0;
      this.consecutiveFailures = 0;
    }

    return true;
  }

  /**
   * Get Redis client
   */
  getClient() {
    if (!this.isEnabled()) {
      throw new Error('Upstash Redis is not enabled');
    }
    return this.client;
  }

  /**
   * Log API request
   * Key format: api:logs:{tenantId}:{timestamp}
   */
  async logRequest({ tenantId, userId, endpoint, method, ip, userAgent, statusCode, responseTime }) {
    if (!this.isEnabled()) {
      return;
    }

    try {
      const timestamp = Date.now();
      const date = new Date(timestamp);
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const normalizedTenantId = tenantId || 'system';

      const logData = {
        tenantId: normalizedTenantId,
        userId: userId || null,
        endpoint,
        method,
        ip,
        userAgent,
        statusCode,
        responseTime,
        timestamp,
      };

      verboseLog('[Upstash] Logging request:', {
        tenantId: normalizedTenantId,
        endpoint,
        method,
        statusCode
      });

      // Store individual request log with 30 days TTL (2592000 seconds)
      const logKey = `api:log:${normalizedTenantId}:${timestamp}`;
      await this.client.setex(logKey, 2592000, JSON.stringify(logData));

      // Increment daily counter
      const dailyKey = `api:count:daily:${normalizedTenantId}:${dateKey}`;
      const dailyResult = await this.client.incr(dailyKey);
      await this.client.expire(dailyKey, 2592000); // 30 days TTL

      verboseLog('[Upstash] Daily counter incremented:', { dailyKey, newCount: dailyResult });

      // Increment weekly counter (week number of year)
      const weekNumber = this.getWeekNumber(date);
      const year = date.getFullYear();
      const weeklyKey = `api:count:weekly:${normalizedTenantId}:${year}:W${weekNumber}`;
      const weeklyResult = await this.client.incr(weeklyKey);
      await this.client.expire(weeklyKey, 7776000); // 90 days TTL

      verboseLog('[Upstash] Weekly counter incremented:', { weeklyKey, newCount: weeklyResult });

      // Increment monthly counter
      const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthlyKey = `api:count:monthly:${normalizedTenantId}:${month}`;
      const monthlyResult = await this.client.incr(monthlyKey);
      await this.client.expire(monthlyKey, 7776000); // 90 days TTL

      verboseLog('[Upstash] Monthly counter incremented:', { monthlyKey, newCount: monthlyResult });

      // Increment endpoint counter
      const endpointKey = `api:endpoint:${normalizedTenantId}:${endpoint}`;
      await this.client.zincrby(endpointKey, 1, dateKey);
      await this.client.expire(endpointKey, 2592000); // 30 days TTL
      this.consecutiveFailures = 0;
    } catch (error) {
      this.handleFailure(error);
    }
  }

  handleFailure(error) {
    const isTimeout = error?.code === 'UND_ERR_CONNECT_TIMEOUT';
    const message = error?.message || 'Unknown error';
    if (isTimeout) {
      console.warn(`[Upstash] Connect timeout while logging request (timeout ${CONNECT_TIMEOUT_MS}ms)`);
    } else {
      console.error('Failed to log API request to Upstash:', error);
    }

    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= FAILURE_THRESHOLD && !this.cooldownUntil) {
      this.cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
      console.error('[Upstash] Too many consecutive failures. Disabling logging temporarily.', {
        cooldownMs: FAILURE_COOLDOWN_MS,
        failures: this.consecutiveFailures,
        lastError: message
      });
    }
  }

  /**
   * Get week number of year (ISO 8601)
   */
  getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  }

  /**
   * Get daily API call count for a specific date
   */
  async getDailyCount(tenantId, date) {
    if (!this.isEnabled()) {
      return 0;
    }

    try {
      const normalizedTenantId = tenantId || 'system';
      const dateKey = date.toISOString().split('T')[0];
      const dailyKey = `api:count:daily:${normalizedTenantId}:${dateKey}`;
      
      verboseLog('[Upstash] getDailyCount:', { 
        tenantId: normalizedTenantId, 
        dateKey, 
        dailyKey 
      });
      
      const count = await this.client.get(dailyKey);
      
      verboseLog('[Upstash] getDailyCount RAW result:', { 
        count, 
        type: typeof count,
        isNull: count === null,
        isUndefined: count === undefined,
        stringified: JSON.stringify(count)
      });
      
      // Handle both string and number responses
      const parsed = count === null || count === undefined ? 0 : parseInt(String(count), 10);
      
  verboseLog('[Upstash] getDailyCount PARSED:', parsed);
      
      return parsed;
    } catch (error) {
      console.error('Failed to get daily count:', error);
      return 0;
    }
  }

  /**
   * Get weekly API call count
   */
  async getWeeklyCount(tenantId, date = new Date()) {
    if (!this.isEnabled()) {
      return 0;
    }

    try {
      const normalizedTenantId = tenantId || 'system';
      const weekNumber = this.getWeekNumber(date);
      const year = date.getFullYear();
      const weeklyKey = `api:count:weekly:${normalizedTenantId}:${year}:W${weekNumber}`;
      
      verboseLog('[Upstash] getWeeklyCount:', { 
        tenantId: normalizedTenantId, 
        year, 
        weekNumber, 
        weeklyKey 
      });
      
      const count = await this.client.get(weeklyKey);
      
      verboseLog('[Upstash] getWeeklyCount RAW result:', { 
        count, 
        type: typeof count,
        isNull: count === null,
        isUndefined: count === undefined,
        stringified: JSON.stringify(count)
      });
      
      // Handle both string and number responses
      const parsed = count === null || count === undefined ? 0 : parseInt(String(count), 10);
      
  verboseLog('[Upstash] getWeeklyCount PARSED:', parsed);
      
      return parsed;
    } catch (error) {
      console.error('Failed to get weekly count:', error);
      return 0;
    }
  }

  /**
   * Get monthly API call count
   */
  async getMonthlyCount(tenantId, date = new Date()) {
    if (!this.isEnabled()) {
      return 0;
    }

    try {
      const normalizedTenantId = tenantId || 'system';
      const year = date.getFullYear();
      const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthlyKey = `api:count:monthly:${normalizedTenantId}:${month}`;
      
      verboseLog('[Upstash] getMonthlyCount:', { 
        tenantId: normalizedTenantId, 
        month, 
        monthlyKey 
      });
      
      const count = await this.client.get(monthlyKey);
      
      verboseLog('[Upstash] getMonthlyCount RAW result:', { 
        count, 
        type: typeof count,
        isNull: count === null,
        isUndefined: count === undefined,
        stringified: JSON.stringify(count)
      });
      
      // Handle both string and number responses
      const parsed = count === null || count === undefined ? 0 : parseInt(String(count), 10);
      
  verboseLog('[Upstash] getMonthlyCount PARSED:', parsed);
      
      return parsed;
    } catch (error) {
      console.error('Failed to get monthly count:', error);
      return 0;
    }
  }

  /**
   * Get API call statistics for dashboard
   */
  async getApiStats(tenantId) {
    if (!this.isEnabled()) {
      return {
        today: 0,
        weekly: 0,
        monthly: 0,
        enabled: false,
      };
    }

  verboseLog('[Upstash] getApiStats called with tenantId:', tenantId);

    try {
      const now = new Date();
      const today = await this.getDailyCount(tenantId, now);
      const weekly = await this.getWeeklyCount(tenantId, now);
      const monthly = await this.getMonthlyCount(tenantId, now);

  verboseLog('[Upstash] getApiStats result:', { today, weekly, monthly });

      return {
        today,
        weekly,
        monthly,
        enabled: true,
      };
    } catch (error) {
      console.error('Failed to get API stats:', error);
      return {
        today: 0,
        weekly: 0,
        monthly: 0,
        enabled: false,
      };
    }
  }
}

// Singleton instance
const upstashClient = new UpstashClient();

module.exports = upstashClient;
