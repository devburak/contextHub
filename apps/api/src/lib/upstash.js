const { Redis } = require('@upstash/redis');

/**
 * Upstash Redis client for API analytics
 */
class UpstashClient {
  constructor() {
    this.client = null;
    this.enabled = false;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;

    const token = process.env.UPSTASH_TOKEN;
    const endpoint = process.env.UPSTASH_ENDPOINT;

    console.log('Upstash initialization:', {
      hasToken: !!token,
      hasEndpoint: !!endpoint,
      endpoint: endpoint || 'not set'
    });

    if (!token || !endpoint) {
      console.warn('Upstash credentials not configured. API analytics will be disabled.');
      return;
    }

    try {
      this.client = new Redis({
        url: endpoint,
        token: token,
      });
      this.enabled = true;
      console.log('Upstash Redis client initialized successfully');
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
    return this.enabled && this.client !== null;
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

      console.log('[Upstash] Logging request:', { 
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
      
      console.log('[Upstash] Daily counter incremented:', { dailyKey, newCount: dailyResult });

      // Increment weekly counter (week number of year)
      const weekNumber = this.getWeekNumber(date);
      const year = date.getFullYear();
      const weeklyKey = `api:count:weekly:${normalizedTenantId}:${year}:W${weekNumber}`;
      const weeklyResult = await this.client.incr(weeklyKey);
      await this.client.expire(weeklyKey, 7776000); // 90 days TTL
      
      console.log('[Upstash] Weekly counter incremented:', { weeklyKey, newCount: weeklyResult });

      // Increment monthly counter
      const month = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthlyKey = `api:count:monthly:${normalizedTenantId}:${month}`;
      const monthlyResult = await this.client.incr(monthlyKey);
      await this.client.expire(monthlyKey, 7776000); // 90 days TTL
      
      console.log('[Upstash] Monthly counter incremented:', { monthlyKey, newCount: monthlyResult });

      // Increment endpoint counter
      const endpointKey = `api:endpoint:${normalizedTenantId}:${endpoint}`;
      await this.client.zincrby(endpointKey, 1, dateKey);
      await this.client.expire(endpointKey, 2592000); // 30 days TTL

    } catch (error) {
      console.error('Failed to log API request to Upstash:', error);
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
      
      console.log('[Upstash] getDailyCount:', { 
        tenantId: normalizedTenantId, 
        dateKey, 
        dailyKey 
      });
      
      const count = await this.client.get(dailyKey);
      
      console.log('[Upstash] getDailyCount RAW result:', { 
        count, 
        type: typeof count,
        isNull: count === null,
        isUndefined: count === undefined,
        stringified: JSON.stringify(count)
      });
      
      // Handle both string and number responses
      const parsed = count === null || count === undefined ? 0 : parseInt(String(count), 10);
      
      console.log('[Upstash] getDailyCount PARSED:', parsed);
      
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
      
      console.log('[Upstash] getWeeklyCount:', { 
        tenantId: normalizedTenantId, 
        year, 
        weekNumber, 
        weeklyKey 
      });
      
      const count = await this.client.get(weeklyKey);
      
      console.log('[Upstash] getWeeklyCount RAW result:', { 
        count, 
        type: typeof count,
        isNull: count === null,
        isUndefined: count === undefined,
        stringified: JSON.stringify(count)
      });
      
      // Handle both string and number responses
      const parsed = count === null || count === undefined ? 0 : parseInt(String(count), 10);
      
      console.log('[Upstash] getWeeklyCount PARSED:', parsed);
      
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
      
      console.log('[Upstash] getMonthlyCount:', { 
        tenantId: normalizedTenantId, 
        month, 
        monthlyKey 
      });
      
      const count = await this.client.get(monthlyKey);
      
      console.log('[Upstash] getMonthlyCount RAW result:', { 
        count, 
        type: typeof count,
        isNull: count === null,
        isUndefined: count === undefined,
        stringified: JSON.stringify(count)
      });
      
      // Handle both string and number responses
      const parsed = count === null || count === undefined ? 0 : parseInt(String(count), 10);
      
      console.log('[Upstash] getMonthlyCount PARSED:', parsed);
      
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

    console.log('[Upstash] getApiStats called with tenantId:', tenantId);

    try {
      const now = new Date();
      const today = await this.getDailyCount(tenantId, now);
      const weekly = await this.getWeeklyCount(tenantId, now);
      const monthly = await this.getMonthlyCount(tenantId, now);

      console.log('[Upstash] getApiStats result:', { today, weekly, monthly });

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
