const mongoose = require('mongoose');
const ApiUsage = require('@contexthub/common/src/models/ApiUsage');
const Tenant = require('@contexthub/common/src/models/Tenant');
const localRedisClient = require('../lib/localRedis');
const usageRedis = require('../lib/usageRedis');

const HALF_DAY_PERIOD = 'halfday';
const MONTHLY_PERIOD = 'monthly';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getHalfDayPeriod(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = date.getUTCHours();

  const startHour = hour < 12 ? 0 : 12;
  const startDate = new Date(Date.UTC(year, month, day, startHour, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month, day, startHour + 12, 0, 0, 0));
  const endDate = new Date(endExclusive.getTime() - 1);

  const periodKey = `${year}-${pad2(month + 1)}-${pad2(day)}T${startHour === 0 ? '00' : '12'}`;

  return {
    periodKey,
    startDate,
    endDate,
    endExclusive,
  };
}

function getPreviousHalfDayPeriod(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const hour = now.getUTCHours();
  const boundaryHour = hour < 12 ? 0 : 12;
  const boundaryStart = new Date(Date.UTC(year, month, day, boundaryHour, 0, 0, 0));
  const previousEnd = new Date(boundaryStart.getTime() - 1);
  return getHalfDayPeriod(previousEnd);
}

function getUtcDayRange(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month, day + 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

function getUtcWeekRange(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = utcDate.getUTCDay() || 7; // 1 (Mon) - 7 (Sun)
  utcDate.setUTCDate(utcDate.getUTCDate() - (dayOfWeek - 1));

  const start = new Date(Date.UTC(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    0, 0, 0, 0
  ));
  const endExclusive = new Date(start.getTime());
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 7);

  return { start, endExclusive };
}

function getUtcMonthRange(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

function getMonthKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  return `${year}-${month}`;
}

function resolveTenantObjectId(tenantId) {
  if (!tenantId || tenantId === 'system') {
    return null;
  }

  return mongoose.Types.ObjectId.isValid(tenantId)
    ? new mongoose.Types.ObjectId(tenantId)
    : null;
}

async function sumUsageForRange(tenantId, start, endExclusive) {
  const objectId = resolveTenantObjectId(tenantId);

  if (!objectId) {
    return 0;
  }

  const results = await ApiUsage.aggregate([
    {
      $match: {
        tenantId: objectId,
        period: HALF_DAY_PERIOD,
        startDate: { $gte: start, $lt: endExclusive },
      },
    },
    {
      $group: {
        _id: null,
        totalCalls: { $sum: '$totalCalls' },
      },
    },
  ]);

  return results[0]?.totalCalls || 0;
}

async function getUsageStats(tenantId, date = new Date()) {
  const dayRange = getUtcDayRange(date);
  const weekRange = getUtcWeekRange(date);

  const [today, weekly, monthly, currentHalfDay] = await Promise.all([
    sumUsageForRange(tenantId, dayRange.start, dayRange.endExclusive),
    sumUsageForRange(tenantId, weekRange.start, weekRange.endExclusive),
    getMonthlyUsage(tenantId, date),
    getCurrentHalfDayCount(tenantId, date),
  ]);

  return {
    today: today + currentHalfDay,
    weekly: weekly + currentHalfDay,
    monthly: monthly + currentHalfDay,
  };
}

async function getMonthlyUsage(tenantId, date = new Date()) {
  const objectId = resolveTenantObjectId(tenantId);
  if (!objectId) {
    return 0;
  }

  const periodKey = getMonthKey(date);
  const existing = await ApiUsage.findOne({
    tenantId: objectId,
    period: MONTHLY_PERIOD,
    periodKey,
  }, 'totalCalls').lean();

  if (existing) {
    return existing.totalCalls || 0;
  }

  const range = getUtcMonthRange(date);
  return sumUsageForRange(tenantId, range.start, range.endExclusive);
}

async function getCurrentHalfDayCount(tenantId, date = new Date()) {
  if (!usageRedis.isEnabled()) {
    return 0;
  }

  const normalizedTenantId = tenantId || 'system';
  const period = getHalfDayPeriod(date);
  const key = `api:count:12h:${normalizedTenantId}:${period.periodKey}`;

  const value = await usageRedis.get(key);
  return value ? Number(value) : 0;
}

async function incrementMonthlyUsage(tenantId, periodStartDate, delta) {
  if (!delta || delta <= 0) {
    return { skipped: true };
  }

  const objectId = resolveTenantObjectId(tenantId);
  if (!objectId) {
    return { skipped: true };
  }

  const periodKey = getMonthKey(periodStartDate);
  const range = getUtcMonthRange(periodStartDate);
  const endDate = new Date(range.endExclusive.getTime() - 1);

  await ApiUsage.findOneAndUpdate(
    {
      tenantId: objectId,
      period: MONTHLY_PERIOD,
      periodKey,
    },
    {
      $inc: { totalCalls: delta },
      $set: { syncedAt: new Date() },
      $setOnInsert: {
        startDate: range.start,
        endDate,
        period: MONTHLY_PERIOD,
        periodKey,
      },
    },
    {
      upsert: true,
      new: true,
    }
  );

  return { periodKey, delta };
}

async function resetMonthlyUsageIfNeeded(now = new Date()) {
  const monthStart = getUtcMonthRange(now).start;
  const staleFilter = {
    $or: [
      { 'currentUsage.lastUpdated': { $lt: monthStart } },
      { 'currentUsage.lastUpdated': { $exists: false } },
      { currentUsage: { $exists: false } },
    ],
  };

  const tenants = await Tenant.find(staleFilter, '_id').lean();
  if (!tenants.length) {
    return { reset: 0 };
  }

  const tenantIds = tenants.map(t => t._id.toString());

  await Tenant.updateMany(
    { _id: { $in: tenantIds } },
    {
      $set: {
        'currentUsage.monthlyRequests': 0,
        'currentUsage.lastUpdated': now,
      },
    }
  );

  if (localRedisClient.isEnabled()) {
    await Promise.all(tenantIds.map(id => localRedisClient.clearRequestLimitFlag(id)));
  } else {
    console.warn('[ApiUsage] Local Redis not enabled; unable to clear limit flags on reset');
  }

  return { reset: tenantIds.length };
}

async function refreshMonthlyLimitFlag(tenantId, date = new Date()) {
  if (!tenantId || tenantId === 'system') {
    return { skipped: true };
  }

  const tenant = await Tenant.findById(tenantId).populate('currentPlan');
  if (!tenant) {
    return { skipped: true, reason: 'tenant_not_found' };
  }

  const limit = await tenant.getLimit('monthlyRequestLimit');
  const usage = await getMonthlyUsage(tenantId, date);
  const now = new Date();

  tenant.currentUsage = tenant.currentUsage || {};
  tenant.currentUsage.monthlyRequests = usage;
  tenant.currentUsage.lastUpdated = now;
  await tenant.save();

  if (limit === null || limit === -1) {
    if (localRedisClient.isEnabled()) {
      await localRedisClient.clearRequestLimitFlag(tenantId);
    }
    return { exceeded: false, isUnlimited: true, usage, limit };
  }

  if (usage >= limit) {
    if (localRedisClient.isEnabled()) {
      await localRedisClient.setRequestLimitFlag(tenantId, {
        exceeded: true,
        limit,
        usage,
        periodKey: getMonthKey(date),
        setAt: now.toISOString(),
      });
    }
    return { exceeded: true, usage, limit };
  }

  if (localRedisClient.isEnabled()) {
    await localRedisClient.clearRequestLimitFlag(tenantId);
  }

  return { exceeded: false, usage, limit };
}

module.exports = {
  HALF_DAY_PERIOD,
  MONTHLY_PERIOD,
  getHalfDayPeriod,
  getPreviousHalfDayPeriod,
  getUtcDayRange,
  getUtcWeekRange,
  getUtcMonthRange,
  getMonthKey,
  getUsageStats,
  getMonthlyUsage,
  getCurrentHalfDayCount,
  incrementMonthlyUsage,
  resetMonthlyUsageIfNeeded,
  refreshMonthlyLimitFlag,
};
