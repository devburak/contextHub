const localRedisClient = require('../lib/localRedis');
const ApiUsage = require('@contexthub/common/src/models/ApiUsage');
const ApiUsageSyncState = require('@contexthub/common/src/models/ApiUsageSyncState');
const Tenant = require('@contexthub/common/src/models/Tenant');
const apiUsageService = require('./apiUsageService');

const SYNC_LOCK_KEY = 'usage:sync:4hour';
const SYNC_LOCK_TTL_SECONDS = 5 * 60;

class ApiUsageSyncService {
  async getLastClosedPeriodEnd() {
    const state = await ApiUsageSyncState.findOne({ key: apiUsageService.FOUR_HOUR_PERIOD }).lean();
    let lastEnd = state?.lastPeriodEnd ? new Date(state.lastPeriodEnd) : null;

    if (!lastEnd || Number.isNaN(lastEnd.getTime())) {
      const lastRecord = await ApiUsage.findOne({ period: apiUsageService.FOUR_HOUR_PERIOD })
        .sort({ endDate: -1 })
        .lean();
      lastEnd = lastRecord?.endDate ? new Date(lastRecord.endDate) : null;
    }

    return lastEnd && !Number.isNaN(lastEnd.getTime()) ? lastEnd : null;
  }

  async getClosedPeriodsToSync(now = new Date()) {
    const targetPeriod = apiUsageService.getPreviousFourHourPeriod(now);
    const lastEnd = await this.getLastClosedPeriodEnd();

    if (!lastEnd) {
      return [targetPeriod];
    }

    if (lastEnd >= targetPeriod.endDate) {
      return [];
    }

    const periods = [];
    let cursor = new Date(lastEnd.getTime() + 1);

    while (cursor <= targetPeriod.endDate) {
      const period = apiUsageService.getFourHourPeriod(cursor);
      periods.push(period);
      cursor = new Date(period.endExclusive.getTime());
    }

    return periods;
  }

  async syncFourHourUsage(options = {}) {
    console.log('[ApiUsageSync] Starting 4-hour usage sync...');

    if (!localRedisClient.isEnabled()) {
      console.warn('[ApiUsageSync] Local Redis is not enabled, skipping usage sync');
      return {
        success: true,
        processed: 0,
        saved: 0,
        deleted: 0,
        errors: 0,
        flushedCalls: 0,
        redisEnabled: false,
        skipped: true,
        reason: 'redis_unavailable',
        periodKeys: [],
        tenants: [],
      };
    }

    const lockToken = await localRedisClient.acquireLock(SYNC_LOCK_KEY, SYNC_LOCK_TTL_SECONDS);
    if (!lockToken) {
      return {
        success: true,
        processed: 0,
        saved: 0,
        deleted: 0,
        errors: 0,
        flushedCalls: 0,
        redisEnabled: true,
        skipped: true,
        reason: 'sync_in_progress',
        periodKeys: [],
        tenants: [],
      };
    }

    try {
      const now = new Date();
      const includeCurrent = options.includeCurrent !== false;
      const closedPeriods = await this.getClosedPeriodsToSync(now);
      const currentPeriod = apiUsageService.getFourHourPeriod(now);
      const periods = includeCurrent
        ? [...closedPeriods, currentPeriod]
        : [...closedPeriods];
      const uniquePeriods = periods.filter((period, index, list) =>
        list.findIndex(item => item.periodKey === period.periodKey) === index
      );

      if (!uniquePeriods.length) {
        return {
          success: true,
          processed: 0,
          saved: 0,
          deleted: 0,
          errors: 0,
          flushedCalls: 0,
          redisEnabled: true,
          periodKeys: [],
          tenants: [],
        };
      }

      const tenants = await Tenant.find({}, '_id').lean();
      const tenantIds = tenants.map(item => item._id.toString());
      const touchedTenants = new Set();
      const results = {
        processed: 0,
        saved: 0,
        deleted: 0,
        errors: 0,
        flushedCalls: 0,
        redisEnabled: true,
        periodKeys: uniquePeriods.map(period => period.periodKey),
        tenants: [],
      };

      for (const period of uniquePeriods) {
        const isClosedPeriod = period.endExclusive <= now;

        for (const tenantId of tenantIds) {
          try {
            const counter = await localRedisClient.getUsageCounter(tenantId, period.periodKey);
            if (!counter) {
              results.processed++;
              continue;
            }

            if (counter.pending > 0) {
              await ApiUsage.findOneAndUpdate(
                {
                  tenantId,
                  period: apiUsageService.FOUR_HOUR_PERIOD,
                  periodKey: period.periodKey,
                },
                {
                  $inc: { totalCalls: counter.pending },
                  $set: {
                    startDate: period.startDate,
                    endDate: period.endDate,
                    syncedAt: new Date(),
                    redisKeys: [{
                      key: localRedisClient.getUsageCounterKey(tenantId, period.periodKey),
                      value: counter.count,
                    }],
                  },
                  $setOnInsert: {
                    period: apiUsageService.FOUR_HOUR_PERIOD,
                    periodKey: period.periodKey,
                  },
                },
                {
                  upsert: true,
                  new: true,
                }
              );

              await localRedisClient.setUsageFlushedCount(
                tenantId,
                period.periodKey,
                counter.count,
                apiUsageService.USAGE_KEY_TTL_SECONDS
              );

              results.saved++;
              results.flushedCalls += counter.pending;
              touchedTenants.add(tenantId);
              results.tenants.push({
                tenantId,
                periodKey: period.periodKey,
                count: counter.count,
                pending: counter.pending,
              });
            }

            if (isClosedPeriod) {
              await localRedisClient.deleteUsageCounter(tenantId, period.periodKey);
              results.deleted++;
            }

            results.processed++;
          } catch (error) {
            console.error(`[ApiUsageSync] Error processing tenant ${tenantId} period ${period.periodKey}:`, error);
            results.errors++;
          }
        }
      }

      if (closedPeriods.length > 0) {
        const lastClosedPeriod = closedPeriods[closedPeriods.length - 1];
        await ApiUsageSyncState.findOneAndUpdate(
          { key: apiUsageService.FOUR_HOUR_PERIOD },
          {
            $set: {
              lastPeriodKey: lastClosedPeriod.periodKey,
              lastPeriodEnd: lastClosedPeriod.endDate,
            },
          },
          { upsert: true, new: true }
        );
      }

      for (const tenantId of touchedTenants) {
        try {
          await apiUsageService.refreshMonthlyLimitFlag(tenantId, now);
        } catch (error) {
          console.error(`[ApiUsageSync] Failed to refresh request state for tenant ${tenantId}:`, error);
          results.errors++;
        }
      }

      console.log('[ApiUsageSync] 4-hour sync completed:', results);
      return { success: true, ...results };
    } catch (error) {
      console.error('[ApiUsageSync] 4-hour sync failed:', error);
      return { success: false, error: error.message };
    } finally {
      await localRedisClient.releaseLock(SYNC_LOCK_KEY, lockToken);
    }
  }

  async syncHalfDayUsage(options = {}) {
    return this.syncFourHourUsage(options);
  }

  async runScheduledSync(options = {}) {
    const now = new Date();
    const results = {
      timestamp: now,
      executed: [],
    };

    console.log('[ApiUsageSync] Running scheduled sync check...');

    const syncResult = await this.syncFourHourUsage({
      includeCurrent: options.includeCurrent !== false,
    });
    results.executed.push({ type: '4hour', ...syncResult });

    await this.refreshLimitsCache();

    console.log('[ApiUsageSync] Scheduled sync completed:', results);
    return results;
  }

  async refreshLimitsCache() {
    if (!localRedisClient.isEnabled()) {
      console.warn('[ApiUsageSync] Local Redis not enabled, skipping cache refresh');
      return;
    }

    try {
      const limitCheckerService = require('./limitCheckerService');
      await Promise.all([
        limitCheckerService.refreshAllLimitsCache(),
        apiUsageService.refreshAllTenantRequestStates(),
      ]);
      console.log('[ApiUsageSync] Limits and request states refreshed successfully');
    } catch (error) {
      console.error('[ApiUsageSync] Failed to refresh limits cache:', error);
    }
  }
}

module.exports = new ApiUsageSyncService();
