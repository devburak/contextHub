const upstashClient = require('../lib/upstash');
const localRedisClient = require('../lib/localRedis');
const ApiUsage = require('@contexthub/common/src/models/ApiUsage');
const Tenant = require('@contexthub/common/src/models/Tenant');

/**
 * API Usage Sync Service
 * Syncs data from Redis to MongoDB and cleans up old Redis keys
 */
class ApiUsageSyncService {
  /**
   * Sync daily usage data (run every day at 00:00)
   * Aggregates previous day's data
   */
  async syncDailyUsage() {
    console.log('[ApiUsageSync] Starting daily sync...');
    
    if (!upstashClient.isEnabled()) {
      console.warn('[ApiUsageSync] Upstash is not enabled, skipping sync');
      return { success: false, message: 'Upstash not enabled' };
    }

    try {
      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const dateKey = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const endOfDay = new Date(yesterday);
      endOfDay.setHours(23, 59, 59, 999);

      console.log('[ApiUsageSync] Syncing daily data for:', dateKey);

      // Get all tenants
      const tenants = await Tenant.find({}, '_id').lean();
      
      console.log(`[ApiUsageSync] Found ${tenants.length} tenants in database`);
      
      const results = {
        processed: 0,
        saved: 0,
        errors: 0,
        tenants: [],
      };

      // Process each tenant + system
      const tenantIds = [...tenants.map(t => t._id.toString()), 'system'];
      
      console.log(`[ApiUsageSync] Processing ${tenantIds.length} tenant IDs (including system):`, tenantIds);

      for (const tenantId of tenantIds) {
        try {
          const dailyKey = `api:count:daily:${tenantId}:${dateKey}`;
          
          console.log(`[ApiUsageSync] Checking Redis key: ${dailyKey}`);
          
          // Get count from Redis
          const count = await upstashClient.getClient().get(dailyKey);
          
          console.log(`[ApiUsageSync] Redis response for ${dailyKey}:`, {
            raw: count,
            type: typeof count,
            isNull: count === null,
            parsed: count ? parseInt(count) : 0,
          });
          
          if (!count || parseInt(count) === 0) {
            console.log(`[ApiUsageSync] No data for tenant ${tenantId} on ${dateKey}`);
            continue;
          }

          const totalCalls = parseInt(count);

          console.log(`[ApiUsageSync] Tenant ${tenantId}: ${totalCalls} calls on ${dateKey}`);

          // Save to MongoDB (upsert)
          const mongoTenantId = tenantId === 'system' ? null : tenantId;
          
          if (mongoTenantId) {
            await ApiUsage.findOneAndUpdate(
              {
                tenantId: mongoTenantId,
                period: 'daily',
                periodKey: dateKey,
              },
              {
                $set: {
                  startDate: yesterday,
                  endDate: endOfDay,
                  totalCalls,
                  syncedAt: new Date(),
                  redisKeys: [{ key: dailyKey, value: totalCalls }],
                },
              },
              {
                upsert: true,
                new: true,
              }
            );

            results.saved++;
          }

          // Delete old Redis key (older than 30 days)
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          if (yesterday < thirtyDaysAgo) {
            await upstashClient.getClient().del(dailyKey);
            console.log(`[ApiUsageSync] Deleted old Redis key: ${dailyKey}`);
          }

          results.tenants.push({ tenantId, totalCalls });
          results.processed++;

        } catch (error) {
          console.error(`[ApiUsageSync] Error processing tenant ${tenantId}:`, error);
          results.errors++;
        }
      }

      console.log('[ApiUsageSync] Daily sync completed:', results);
      return { success: true, ...results };

    } catch (error) {
      console.error('[ApiUsageSync] Daily sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync weekly usage data (run every Sunday at 00:00)
   * Aggregates previous week's data
   */
  async syncWeeklyUsage() {
    console.log('[ApiUsageSync] Starting weekly sync...');
    
    if (!upstashClient.isEnabled()) {
      console.warn('[ApiUsageSync] Upstash is not enabled, skipping sync');
      return { success: false, message: 'Upstash not enabled' };
    }

    try {
      // Get last week's dates
      const lastWeekEnd = new Date();
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1); // Yesterday (end of last week)
      lastWeekEnd.setHours(23, 59, 59, 999);
      
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekStart.getDate() - 6); // 7 days ago
      lastWeekStart.setHours(0, 0, 0, 0);

      const weekNumber = upstashClient.getWeekNumber(lastWeekEnd);
      const year = lastWeekEnd.getFullYear();
      const periodKey = `${year}-W${weekNumber}`;

      console.log('[ApiUsageSync] Syncing weekly data for:', periodKey);

      const tenants = await Tenant.find({}, '_id').lean();
      const results = {
        processed: 0,
        saved: 0,
        errors: 0,
        tenants: [],
      };

      const tenantIds = [...tenants.map(t => t._id.toString()), 'system'];

      for (const tenantId of tenantIds) {
        try {
          const weeklyKey = `api:count:weekly:${tenantId}:${year}:W${weekNumber}`;
          
          const count = await upstashClient.getClient().get(weeklyKey);
          
          if (!count || parseInt(count) === 0) {
            continue;
          }

          const totalCalls = parseInt(count);
          console.log(`[ApiUsageSync] Tenant ${tenantId}: ${totalCalls} calls in week ${periodKey}`);

          const mongoTenantId = tenantId === 'system' ? null : tenantId;
          
          if (mongoTenantId) {
            await ApiUsage.findOneAndUpdate(
              {
                tenantId: mongoTenantId,
                period: 'weekly',
                periodKey,
              },
              {
                $set: {
                  startDate: lastWeekStart,
                  endDate: lastWeekEnd,
                  totalCalls,
                  syncedAt: new Date(),
                  redisKeys: [{ key: weeklyKey, value: totalCalls }],
                },
              },
              {
                upsert: true,
                new: true,
              }
            );

            results.saved++;
          }

          // Delete old Redis key (older than 90 days)
          const ninetyDaysAgo = new Date();
          ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
          
          if (lastWeekEnd < ninetyDaysAgo) {
            await upstashClient.getClient().del(weeklyKey);
            console.log(`[ApiUsageSync] Deleted old Redis key: ${weeklyKey}`);
          }

          results.tenants.push({ tenantId, totalCalls });
          results.processed++;

        } catch (error) {
          console.error(`[ApiUsageSync] Error processing tenant ${tenantId}:`, error);
          results.errors++;
        }
      }

      console.log('[ApiUsageSync] Weekly sync completed:', results);
      return { success: true, ...results };

    } catch (error) {
      console.error('[ApiUsageSync] Weekly sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync monthly usage data (run on the 1st of every month at 00:00)
   * Aggregates previous month's data
   */
  async syncMonthlyUsage() {
    console.log('[ApiUsageSync] Starting monthly sync...');
    
    if (!upstashClient.isEnabled()) {
      console.warn('[ApiUsageSync] Upstash is not enabled, skipping sync');
      return { success: false, message: 'Upstash not enabled' };
    }

    try {
      // Get last month
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      
      const year = lastMonth.getFullYear();
      const month = lastMonth.getMonth() + 1;
      const periodKey = `${year}-${String(month).padStart(2, '0')}`;

      // Start of last month
      const monthStart = new Date(year, month - 1, 1, 0, 0, 0, 0);
      
      // End of last month
      const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

      console.log('[ApiUsageSync] Syncing monthly data for:', periodKey);

      const tenants = await Tenant.find({}, '_id').lean();
      const results = {
        processed: 0,
        saved: 0,
        errors: 0,
        deleted: 0,
        tenants: [],
      };

      const tenantIds = [...tenants.map(t => t._id.toString()), 'system'];

      for (const tenantId of tenantIds) {
        try {
          const monthlyKey = `api:count:monthly:${tenantId}:${periodKey}`;
          
          const count = await upstashClient.getClient().get(monthlyKey);
          
          if (!count || parseInt(count) === 0) {
            continue;
          }

          const totalCalls = parseInt(count);
          console.log(`[ApiUsageSync] Tenant ${tenantId}: ${totalCalls} calls in ${periodKey}`);

          const mongoTenantId = tenantId === 'system' ? null : tenantId;
          
          if (mongoTenantId) {
            await ApiUsage.findOneAndUpdate(
              {
                tenantId: mongoTenantId,
                period: 'monthly',
                periodKey,
              },
              {
                $set: {
                  startDate: monthStart,
                  endDate: monthEnd,
                  totalCalls,
                  syncedAt: new Date(),
                  redisKeys: [{ key: monthlyKey, value: totalCalls }],
                },
              },
              {
                upsert: true,
                new: true,
              }
            );

            results.saved++;
          }

          // IMPORTANT: After monthly sync, clean up Redis
          // Delete daily keys from last month
          const daysInMonth = new Date(year, month, 0).getDate();
          for (let day = 1; day <= daysInMonth; day++) {
            const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dailyKey = `api:count:daily:${tenantId}:${dateKey}`;
            
            try {
              await upstashClient.getClient().del(dailyKey);
              results.deleted++;
            } catch (error) {
              console.error(`[ApiUsageSync] Error deleting ${dailyKey}:`, error.message);
            }
          }

          // Delete weekly keys from last month (approximately 4-5 weeks)
          const firstWeek = upstashClient.getWeekNumber(monthStart);
          const lastWeek = upstashClient.getWeekNumber(monthEnd);
          
          for (let week = firstWeek; week <= lastWeek; week++) {
            const weeklyKey = `api:count:weekly:${tenantId}:${year}:W${week}`;
            
            try {
              await upstashClient.getClient().del(weeklyKey);
              results.deleted++;
            } catch (error) {
              console.error(`[ApiUsageSync] Error deleting ${weeklyKey}:`, error.message);
            }
          }

          // Delete monthly key itself (now stored in MongoDB)
          await upstashClient.getClient().del(monthlyKey);
          results.deleted++;

          console.log(`[ApiUsageSync] Cleaned up Redis keys for tenant ${tenantId}, month ${periodKey}`);

          results.tenants.push({ tenantId, totalCalls });
          results.processed++;

        } catch (error) {
          console.error(`[ApiUsageSync] Error processing tenant ${tenantId}:`, error);
          results.errors++;
        }
      }

      console.log('[ApiUsageSync] Monthly sync completed:', results);
      return { success: true, ...results };

    } catch (error) {
      console.error('[ApiUsageSync] Monthly sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run all pending syncs based on current date
   * This is the main entry point for the cron job
   */
  async runScheduledSync() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const dayOfMonth = now.getDate();
    
    const results = {
      timestamp: now,
      executed: [],
    };

    console.log('[ApiUsageSync] Running scheduled sync check...');
    console.log('[ApiUsageSync] Day of week:', dayOfWeek, '(0=Sunday)');
    console.log('[ApiUsageSync] Day of month:', dayOfMonth);

    // Always run daily sync (every day at 00:00)
    console.log('[ApiUsageSync] Executing daily sync...');
    const dailyResult = await this.syncDailyUsage();
    results.executed.push({ type: 'daily', ...dailyResult });

    // Run weekly sync on Sundays (day 0)
    if (dayOfWeek === 0) {
      console.log('[ApiUsageSync] Today is Sunday, executing weekly sync...');
      const weeklyResult = await this.syncWeeklyUsage();
      results.executed.push({ type: 'weekly', ...weeklyResult });
    }

    // Run monthly sync on the 1st of the month
    if (dayOfMonth === 1) {
      console.log('[ApiUsageSync] Today is 1st of the month, executing monthly sync...');
      const monthlyResult = await this.syncMonthlyUsage();
      results.executed.push({ type: 'monthly', ...monthlyResult });
    }

    // Refresh limits cache in local Redis
    await this.refreshLimitsCache();

    console.log('[ApiUsageSync] Scheduled sync completed:', results);
    return results;
  }

  /**
   * Refresh tenant limits cache in local Redis
   * Called after each sync to update request quotas
   */
  async refreshLimitsCache() {
    console.log('[ApiUsageSync] Refreshing limits cache...');
    
    if (!localRedisClient.isEnabled()) {
      console.warn('[ApiUsageSync] Local Redis not enabled, skipping cache refresh');
      return;
    }

    try {
      const limitCheckerService = require('./limitCheckerService');
      await limitCheckerService.refreshAllLimitsCache();
      
      console.log('[ApiUsageSync] Limits cache refreshed successfully');
    } catch (error) {
      console.error('[ApiUsageSync] Failed to refresh limits cache:', error);
    }
  }
}

module.exports = new ApiUsageSyncService();
