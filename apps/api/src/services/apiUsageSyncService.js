const usageRedis = require('../lib/usageRedis');
const localRedisClient = require('../lib/localRedis');
const ApiUsage = require('@contexthub/common/src/models/ApiUsage');
const ApiUsageSyncState = require('@contexthub/common/src/models/ApiUsageSyncState');
const Tenant = require('@contexthub/common/src/models/Tenant');
const apiUsageService = require('./apiUsageService');

/**
 * API Usage Sync Service
 * Syncs 12-hour usage data from Redis to MongoDB and cleans up Redis keys
 */
class ApiUsageSyncService {
  async getPendingPeriods(targetPeriod, options = {}) {
    const { force = false, includeCurrent = false } = options;

    if (force && includeCurrent) {
      return [targetPeriod];
    }

    const state = await ApiUsageSyncState.findOne({ key: apiUsageService.HALF_DAY_PERIOD }).lean();
    let lastEnd = state?.lastPeriodEnd ? new Date(state.lastPeriodEnd) : null;

    if (!lastEnd || Number.isNaN(lastEnd.getTime())) {
      const lastRecord = await ApiUsage.findOne({ period: apiUsageService.HALF_DAY_PERIOD })
        .sort({ endDate: -1 })
        .lean();
      lastEnd = lastRecord?.endDate ? new Date(lastRecord.endDate) : null;
    }

    if (!lastEnd || Number.isNaN(lastEnd.getTime())) {
      return [targetPeriod];
    }

    if (lastEnd >= targetPeriod.endDate) {
      return [];
    }

    const periods = [];
    let cursor = new Date(lastEnd.getTime() + 1);

    while (cursor <= targetPeriod.endDate) {
      const period = apiUsageService.getHalfDayPeriod(cursor);
      periods.push(period);
      cursor = new Date(period.endExclusive.getTime());
    }

    return periods;
  }

  /**
   * Sync half-day usage data (run every 12 hours at 00:00 and 12:00 UTC)
   */
  async syncHalfDayUsage(options = {}) {
    console.log('[ApiUsageSync] Starting half-day sync...');

    const redisEnabled = usageRedis.isEnabled();
    if (!redisEnabled) {
      console.warn('[ApiUsageSync] Usage Redis is not enabled, skipping Redis transfer');
    }

    try {
      const now = new Date();
      const includeCurrent = options.force === true;
      const targetPeriod = includeCurrent
        ? apiUsageService.getHalfDayPeriod(now)
        : apiUsageService.getPreviousHalfDayPeriod(now);

      const resetResult = await apiUsageService.resetMonthlyUsageIfNeeded(now);

      const periods = await this.getPendingPeriods(targetPeriod, {
        force: options.force,
        includeCurrent,
      });
      if (!periods.length) {
        return {
          success: true,
          message: 'No new periods to sync',
          processed: 0,
          saved: 0,
          errors: 0,
          deleted: 0,
          redisEnabled,
          resetResult,
          periodKeys: [],
          tenants: [],
        };
      }

      console.log('[ApiUsageSync] Syncing half-day data for periods:', periods.map(p => p.periodKey));

      const tenants = await Tenant.find({}, '_id').lean();
      const tenantIds = [...tenants.map(t => t._id.toString()), 'system'];
      const tenantsToRefresh = new Set();

      const results = {
        processed: 0,
        saved: 0,
        errors: 0,
        deleted: 0,
        redisEnabled,
        resetResult,
        periodKeys: periods.map(p => p.periodKey),
        tenants: [],
      };

      for (const period of periods) {
        for (const tenantId of tenantIds) {
          try {
            if (redisEnabled) {
              const redisKey = `api:count:12h:${tenantId}:${period.periodKey}`;
              const count = await usageRedis.get(redisKey);

              if (count && count > 0) {
                const totalCalls = parseInt(count, 10);
                const mongoTenantId = tenantId === 'system' ? null : tenantId;

                if (mongoTenantId) {
                  const existing = await ApiUsage.findOneAndUpdate(
                    {
                      tenantId: mongoTenantId,
                      period: apiUsageService.HALF_DAY_PERIOD,
                      periodKey: period.periodKey,
                    },
                    {
                      $set: {
                        startDate: period.startDate,
                        endDate: period.endDate,
                        totalCalls,
                        syncedAt: new Date(),
                        redisKeys: [{ key: redisKey, value: totalCalls }],
                      },
                    },
                    {
                      upsert: true,
                      new: false,
                    }
                  );

                  const previousTotal = existing?.totalCalls || 0;
                  const delta = totalCalls - previousTotal;
                  await apiUsageService.incrementMonthlyUsage(tenantId, period.startDate, delta);
                  tenantsToRefresh.add(tenantId);
                  results.saved++;
                }

                results.tenants.push({ tenantId, periodKey: period.periodKey, totalCalls });
              }

              if (count !== null) {
                const deleted = await usageRedis.del(redisKey);
                results.deleted += Number(deleted || 0);
              }
            }

            results.processed++;
          } catch (error) {
            console.error(`[ApiUsageSync] Error processing tenant ${tenantId} period ${period.periodKey}:`, error);
            results.errors++;
          }
        }
      }

      for (const tenantId of tenantsToRefresh) {
        try {
          await apiUsageService.refreshMonthlyLimitFlag(tenantId, now);
        } catch (error) {
          console.error(`[ApiUsageSync] Failed to refresh limit flag for tenant ${tenantId}:`, error);
          results.errors++;
        }
      }

      if (redisEnabled) {
        const lastPeriod = periods[periods.length - 1];
        await ApiUsageSyncState.findOneAndUpdate(
          { key: apiUsageService.HALF_DAY_PERIOD },
          {
            $set: {
              lastPeriodKey: lastPeriod.periodKey,
              lastPeriodEnd: lastPeriod.endDate,
            },
          },
          { upsert: true, new: true }
        );
      }

      console.log('[ApiUsageSync] Half-day sync completed:', results);
      return { success: true, ...results };
    } catch (error) {
      console.error('[ApiUsageSync] Half-day sync failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Run scheduled sync (half-day)
   */
  async runScheduledSync(options = {}) {
    const now = new Date();
    const results = {
      timestamp: now,
      executed: [],
    };

    console.log('[ApiUsageSync] Running scheduled sync check...');
    const halfDayResult = await this.syncHalfDayUsage(options);
    results.executed.push({ type: 'halfday', ...halfDayResult });

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
