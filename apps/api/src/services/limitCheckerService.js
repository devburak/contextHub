const localRedisClient = require('../lib/localRedis');
const upstashClient = require('../lib/upstash');
const Tenant = require('@contexthub/common/src/models/Tenant');
const SubscriptionPlan = require('@contexthub/common/src/models/SubscriptionPlan'); // Pre-load for populate
const Membership = require('@contexthub/common/src/models/Membership');
const Media = require('@contexthub/common/src/models/Media');

/**
 * Limit Checker Service
 * Fast limit checking using Local Redis cache with MongoDB fallback
 */
class LimitCheckerService {
  
  /**
   * Get tenant with populated plan
   */
  async getTenant(tenantId) {
    return await Tenant.findById(tenantId).populate('currentPlan');
  }

  /**
   * Get tenant limits from cache or database
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} Limits object
   */
  async getTenantLimits(tenantId) {
    // Try cache first
    if (localRedisClient.isEnabled()) {
      const cached = await localRedisClient.getTenantLimits(tenantId);
      if (cached) {
        console.log(`[LimitChecker] Using cached limits for tenant ${tenantId}`);
        return cached;
      }
    }

    // Fallback to database
    console.log(`[LimitChecker] Cache miss, fetching from database for tenant ${tenantId}`);
    const tenant = await this.getTenant(tenantId);
    
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const limits = {
      userLimit: await tenant.getLimit('userLimit'),
      ownerLimit: await tenant.getLimit('ownerLimit'),
      storageLimit: await tenant.getLimit('storageLimit'),
      monthlyRequestLimit: await tenant.getLimit('monthlyRequestLimit'),
    };

    // Cache for 24 hours
    if (localRedisClient.isEnabled()) {
      await localRedisClient.cacheTenantLimits(tenantId, limits, 86400);
    }

    return limits;
  }

  /**
   * Check if tenant can make more API requests
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} { allowed: boolean, remaining: number, limit: number }
   */
  async checkRequestLimit(tenantId) {
    try {
      const limits = await this.getTenantLimits(tenantId);
      
      // Unlimited
      if (limits.monthlyRequestLimit === null || limits.monthlyRequestLimit === -1) {
        return {
          allowed: true,
          remaining: Infinity,
          limit: null,
          isUnlimited: true,
        };
      }

      // Check local Redis cache for remaining quota
      let remaining = null;
      
      if (localRedisClient.isEnabled()) {
        remaining = await localRedisClient.getRequestQuota(tenantId);
      }

      // If not in cache, calculate from Upstash
      if (remaining === null) {
        console.log(`[LimitChecker] Request quota not cached, calculating from Upstash`);
        
        if (upstashClient.isEnabled()) {
          const stats = await upstashClient.getApiStats(tenantId);
          const currentUsage = stats.monthly || 0;
          remaining = Math.max(0, limits.monthlyRequestLimit - currentUsage);
          
          // Cache the remaining quota
          if (localRedisClient.isEnabled()) {
            await localRedisClient.cacheRequestQuota(tenantId, remaining, 3600); // 1 hour TTL
          }
        } else {
          // No usage tracking available, allow
          remaining = limits.monthlyRequestLimit;
        }
      }

      return {
        allowed: remaining > 0,
        remaining,
        limit: limits.monthlyRequestLimit,
        isUnlimited: false,
      };
    } catch (error) {
      console.error('[LimitChecker] Error checking request limit:', error);
      // Fail open - allow request if check fails
      return {
        allowed: true,
        remaining: null,
        limit: null,
        error: error.message,
      };
    }
  }

  /**
   * Check if tenant can upload a file
   * @param {string} tenantId - Tenant ID
   * @param {number} fileSize - File size in bytes
   * @returns {Promise<Object>} { allowed: boolean, remaining: number, limit: number }
   */
  async checkStorageLimit(tenantId, fileSize) {
    try {
      const limits = await this.getTenantLimits(tenantId);
      
      // Unlimited
      if (limits.storageLimit === null || limits.storageLimit === -1) {
        return {
          allowed: true,
          remaining: Infinity,
          limit: null,
          isUnlimited: true,
        };
      }

      // Get current storage usage
      let currentUsage = null;
      
      if (localRedisClient.isEnabled()) {
        currentUsage = await localRedisClient.getStorageUsage(tenantId);
      }

      // If not cached, calculate from database
      if (currentUsage === null) {
        console.log(`[LimitChecker] Storage usage not cached, calculating from database`);
        
        const tenant = await this.getTenant(tenantId);
        const mediaAgg = await Media.aggregate([
          { $match: { tenantId: tenant._id, status: { $ne: 'deleted' } } },
          { $group: { _id: null, totalSize: { $sum: { $ifNull: ['$size', 0] } } } },
        ]);
        
        currentUsage = mediaAgg.length > 0 ? mediaAgg[0].totalSize : 0;
        
        // Cache for 1 hour
        if (localRedisClient.isEnabled()) {
          await localRedisClient.cacheStorageUsage(tenantId, currentUsage, 3600);
        }
      }

      const remaining = limits.storageLimit - currentUsage;
      const wouldExceed = (currentUsage + fileSize) > limits.storageLimit;

      return {
        allowed: !wouldExceed,
        remaining,
        currentUsage,
        limit: limits.storageLimit,
        isUnlimited: false,
      };
    } catch (error) {
      console.error('[LimitChecker] Error checking storage limit:', error);
      // Fail open - allow upload if check fails
      return {
        allowed: true,
        remaining: null,
        limit: null,
        error: error.message,
      };
    }
  }

  /**
   * Check if tenant can add more users
   * @param {string} tenantId - Tenant ID
   * @returns {Promise<Object>} { allowed: boolean, remaining: number, limit: number }
   */
  async checkUserLimit(tenantId) {
    try {
      const limits = await this.getTenantLimits(tenantId);
      
      // Unlimited
      if (limits.userLimit === null || limits.userLimit === -1) {
        return {
          allowed: true,
          remaining: Infinity,
          limit: null,
          isUnlimited: true,
        };
      }

      // Get current user count
      const currentCount = await Membership.countDocuments({
        tenantId,
        status: 'active',
      });

      const remaining = limits.userLimit - currentCount;

      return {
        allowed: remaining > 0,
        remaining,
        currentCount,
        limit: limits.userLimit,
        isUnlimited: false,
      };
    } catch (error) {
      console.error('[LimitChecker] Error checking user limit:', error);
      // Fail open - allow if check fails
      return {
        allowed: true,
        remaining: null,
        limit: null,
        error: error.message,
      };
    }
  }

  /**
   * Invalidate cache for a tenant (call when limits change)
   * @param {string} tenantId - Tenant ID
   */
  async invalidateCache(tenantId) {
    if (localRedisClient.isEnabled()) {
      await localRedisClient.invalidateTenantCache(tenantId);
      console.log(`[LimitChecker] Invalidated cache for tenant ${tenantId}`);
    }
  }

  /**
   * Refresh limits cache for all tenants (called by sync service)
   */
  async refreshAllLimitsCache() {
    try {
      const tenants = await Tenant.find({ status: 'active' }).populate('currentPlan');
      
      console.log(`[LimitChecker] Refreshing cache for ${tenants.length} tenants...`);
      
      for (const tenant of tenants) {
        const limits = {
          userLimit: await tenant.getLimit('userLimit'),
          ownerLimit: await tenant.getLimit('ownerLimit'),
          storageLimit: await tenant.getLimit('storageLimit'),
          monthlyRequestLimit: await tenant.getLimit('monthlyRequestLimit'),
        };

        if (localRedisClient.isEnabled()) {
          await localRedisClient.cacheTenantLimits(tenant._id.toString(), limits, 86400);
        }
      }
      
      console.log(`[LimitChecker] Cache refresh complete`);
    } catch (error) {
      console.error('[LimitChecker] Error refreshing cache:', error);
    }
  }
}

// Export singleton instance
const limitCheckerService = new LimitCheckerService();
module.exports = limitCheckerService;
