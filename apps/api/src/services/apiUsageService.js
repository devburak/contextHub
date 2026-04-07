const mongoose = require('mongoose');
const ApiUsage = require('@contexthub/common/src/models/ApiUsage');
const Tenant = require('@contexthub/common/src/models/Tenant');
const localRedisClient = require('../lib/localRedis');

const FOUR_HOUR_PERIOD = '4hour';
const FOUR_HOUR_MS = 4 * 60 * 60 * 1000;
const USAGE_KEY_TTL_SECONDS = 45 * 24 * 60 * 60;
const REQUEST_STATE_TTL_BUFFER_SECONDS = 48 * 60 * 60;

function pad2(value) {
  return String(value).padStart(2, '0');
}

function getMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}`;
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
  const dayOfWeek = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - (dayOfWeek - 1));

  const start = new Date(Date.UTC(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    0, 0, 0, 0
  ));
  const endExclusive = new Date(start.getTime() + (7 * 24 * 60 * 60 * 1000));

  return { start, endExclusive };
}

function getUtcMonthRange(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return { start, endExclusive };
}

function getFourHourPeriod(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const startHour = Math.floor(hour / 4) * 4;
  const startDate = new Date(Date.UTC(year, month, day, startHour, 0, 0, 0));
  const endExclusive = new Date(startDate.getTime() + FOUR_HOUR_MS);
  const endDate = new Date(endExclusive.getTime() - 1);

  return {
    periodKey: `${year}-${pad2(month + 1)}-${pad2(day)}T${pad2(startHour)}`,
    startDate,
    endDate,
    endExclusive,
  };
}

function getPreviousFourHourPeriod(now = new Date()) {
  const current = getFourHourPeriod(now);
  return getFourHourPeriod(new Date(current.startDate.getTime() - 1));
}

function iterateFourHourPeriods(start, endExclusive) {
  if (!(start instanceof Date) || !(endExclusive instanceof Date) || start >= endExclusive) {
    return [];
  }

  const periods = [];
  let cursor = getFourHourPeriod(start).startDate;

  while (cursor < endExclusive) {
    const period = getFourHourPeriod(cursor);
    if (period.endExclusive > start) {
      periods.push(period);
    }
    cursor = new Date(period.endExclusive.getTime());
  }

  return periods;
}

function resolveTenantObjectId(tenantId) {
  if (!tenantId || !mongoose.Types.ObjectId.isValid(tenantId)) {
    return null;
  }

  return new mongoose.Types.ObjectId(tenantId);
}

function normalizeCycleAnchorDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function getBillingCycleRange(tenant, date = new Date()) {
  const monthRange = getUtcMonthRange(date);
  const anchor = normalizeCycleAnchorDate(
    tenant?.subscriptionStartDate || tenant?.billingCycleStart || tenant?.createdAt || null
  );

  let start = monthRange.start;
  if (anchor && anchor >= monthRange.start && anchor < monthRange.endExclusive) {
    start = anchor;
  }

  return {
    start,
    endExclusive: monthRange.endExclusive,
    cycleKey: getMonthKey(date),
    resetAt: monthRange.endExclusive,
  };
}

function getRequestStateTtlSeconds(resetAt, now = new Date()) {
  const secondsUntilReset = Math.ceil((resetAt.getTime() - now.getTime()) / 1000);
  return Math.max(60, secondsUntilReset + REQUEST_STATE_TTL_BUFFER_SECONDS);
}

function isUnlimited(limit) {
  return limit === null || limit === -1;
}

function buildLimitFlagPayload({ limit, usage, periodKey, resetAt, exceeded = true }) {
  return {
    exceeded,
    limit,
    usage,
    periodKey,
    resetAt: resetAt ? resetAt.toISOString() : null,
    setAt: new Date().toISOString(),
  };
}

async function getTenantForUsage(tenantId) {
  if (!tenantId) {
    return null;
  }

  return Tenant.findById(tenantId).populate('currentPlan');
}

async function sumPersistedUsageForRange(tenantId, start, endExclusive) {
  const objectId = resolveTenantObjectId(tenantId);
  if (!objectId) {
    return 0;
  }

  const results = await ApiUsage.aggregate([
    {
      $match: {
        tenantId: objectId,
        period: FOUR_HOUR_PERIOD,
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

async function sumPendingUsageForRange(tenantId, start, endExclusive) {
  if (!tenantId || !localRedisClient.isEnabled()) {
    return 0;
  }

  const periods = iterateFourHourPeriods(start, endExclusive);
  if (!periods.length) {
    return 0;
  }

  const counters = await Promise.all(periods.map(period => localRedisClient.getUsageCounter(tenantId, period.periodKey)));

  return counters.reduce((total, counter) => total + (counter?.pending || 0), 0);
}

async function getUsageForRange(tenantId, start, endExclusive) {
  const [persisted, pending] = await Promise.all([
    sumPersistedUsageForRange(tenantId, start, endExclusive),
    sumPendingUsageForRange(tenantId, start, endExclusive),
  ]);

  return persisted + pending;
}

async function updateTenantCurrentMonthlyUsage(tenantId, usage, now = new Date()) {
  if (!tenantId) {
    return;
  }

  await Tenant.findByIdAndUpdate(tenantId, {
    $set: {
      'currentUsage.monthlyRequests': usage,
      'currentUsage.lastUpdated': now,
    },
  });
}

async function ensureRequestQuotaSeeded(tenantId, cycleKey, remaining, ttlSeconds) {
  if (!localRedisClient.isEnabled()) {
    return remaining;
  }

  const client = localRedisClient.getClient();
  const key = localRedisClient.getRequestQuotaKey(tenantId, cycleKey);
  await client.set(key, String(remaining), { NX: true, EX: ttlSeconds });
  const seededValue = await localRedisClient.getRequestQuota(tenantId, cycleKey);
  return seededValue === null ? remaining : seededValue;
}

async function getMonthlyUsage(tenantId, date = new Date(), options = {}) {
  const tenant = options.tenant || await getTenantForUsage(tenantId);
  if (!tenant) {
    return 0;
  }

  const cycle = getBillingCycleRange(tenant, date);
  return getUsageForRange(tenantId, cycle.start, cycle.endExclusive);
}

async function getCurrentFourHourUsage(tenantId, date = new Date()) {
  const period = getFourHourPeriod(date);
  return getUsageForRange(tenantId, period.startDate, period.endExclusive);
}

async function getUsageStats(tenantId, date = new Date()) {
  const tenant = await getTenantForUsage(tenantId);
  if (!tenant) {
    return {
      fourHour: 0,
      daily: 0,
      today: 0,
      weekly: 0,
      monthly: 0,
      cycleKey: getMonthKey(date),
      enabled: localRedisClient.isEnabled(),
    };
  }

  const dayRange = getUtcDayRange(date);
  const weekRange = getUtcWeekRange(date);
  const cycle = getBillingCycleRange(tenant, date);

  const [fourHour, daily, weekly, monthly] = await Promise.all([
    getCurrentFourHourUsage(tenantId, date),
    getUsageForRange(tenantId, dayRange.start, dayRange.endExclusive),
    getUsageForRange(tenantId, weekRange.start, weekRange.endExclusive),
    getUsageForRange(tenantId, cycle.start, cycle.endExclusive),
  ]);

  return {
    fourHour,
    daily,
    today: daily,
    weekly,
    monthly,
    cycleKey: cycle.cycleKey,
    enabled: true,
  };
}

async function resolveRequestLimitState(tenantId, date = new Date(), options = {}) {
  const tenant = options.tenant || await getTenantForUsage(tenantId);
  if (!tenant) {
    return { skipped: true, reason: 'tenant_not_found' };
  }

  const limit = await tenant.getLimit('monthlyRequestLimit');
  const cycle = getBillingCycleRange(tenant, date);
  const usage = await getMonthlyUsage(tenantId, date, { tenant });
  const remaining = isUnlimited(limit) ? Infinity : Math.max(0, limit - usage);

  return {
    tenant,
    limit,
    usage,
    remaining,
    periodKey: cycle.cycleKey,
    resetAt: cycle.resetAt,
    isUnlimited: isUnlimited(limit),
    exceeded: !isUnlimited(limit) && usage >= limit,
  };
}

async function refreshMonthlyLimitFlag(tenantId, date = new Date(), options = {}) {
  const state = await resolveRequestLimitState(tenantId, date, options);
  if (state.skipped) {
    return state;
  }

  await updateTenantCurrentMonthlyUsage(tenantId, state.usage, date);

  if (!localRedisClient.isEnabled()) {
    return state;
  }

  const ttlSeconds = getRequestStateTtlSeconds(state.resetAt, date);

  if (state.isUnlimited) {
    await Promise.all([
      localRedisClient.clearRequestLimitFlag(tenantId, state.periodKey),
      localRedisClient.clearRequestQuota(tenantId, state.periodKey),
    ]);
    return state;
  }

  await localRedisClient.cacheRequestQuota(tenantId, state.remaining, ttlSeconds, state.periodKey);

  if (state.exceeded) {
    await localRedisClient.setRequestLimitFlag(
      tenantId,
      buildLimitFlagPayload({
        limit: state.limit,
        usage: state.usage,
        periodKey: state.periodKey,
        resetAt: state.resetAt,
      }),
      ttlSeconds,
      state.periodKey
    );
  } else {
    await localRedisClient.clearRequestLimitFlag(tenantId, state.periodKey);
  }

  return state;
}

async function reserveRequestQuota(tenantId, date = new Date()) {
  const initialState = await resolveRequestLimitState(tenantId, date);
  if (initialState.skipped) {
    return initialState;
  }

  if (initialState.isUnlimited) {
    if (localRedisClient.isEnabled()) {
      await Promise.all([
        localRedisClient.clearRequestLimitFlag(tenantId, initialState.periodKey),
        localRedisClient.clearRequestQuota(tenantId, initialState.periodKey),
      ]);
    }

    await updateTenantCurrentMonthlyUsage(tenantId, initialState.usage, date);
    return {
      ...initialState,
      allowed: true,
      enforced: false,
    };
  }

  if (!localRedisClient.isEnabled()) {
    await updateTenantCurrentMonthlyUsage(tenantId, initialState.usage, date);
    return {
      ...initialState,
      allowed: initialState.usage < initialState.limit,
      enforced: true,
      fallback: true,
    };
  }

  const ttlSeconds = getRequestStateTtlSeconds(initialState.resetAt, date);
  const seededRemaining = await ensureRequestQuotaSeeded(
    tenantId,
    initialState.periodKey,
    initialState.remaining,
    ttlSeconds
  );

  if (seededRemaining <= 0) {
    await localRedisClient.setRequestLimitFlag(
      tenantId,
      buildLimitFlagPayload({
        limit: initialState.limit,
        usage: initialState.usage,
        periodKey: initialState.periodKey,
        resetAt: initialState.resetAt,
      }),
      ttlSeconds,
      initialState.periodKey
    );

    return {
      ...initialState,
      remaining: 0,
      allowed: false,
      enforced: true,
    };
  }

  const newRemaining = await localRedisClient.decrementRequestQuota(tenantId, initialState.periodKey);
  if (newRemaining === null) {
    return {
      ...initialState,
      allowed: initialState.remaining > 0,
      enforced: true,
      fallback: true,
    };
  }

  if (newRemaining < 0) {
    await localRedisClient.incrementRequestQuota(tenantId, initialState.periodKey);
    await localRedisClient.setRequestLimitFlag(
      tenantId,
      buildLimitFlagPayload({
        limit: initialState.limit,
        usage: initialState.limit,
        periodKey: initialState.periodKey,
        resetAt: initialState.resetAt,
      }),
      ttlSeconds,
      initialState.periodKey
    );

    return {
      ...initialState,
      usage: initialState.limit,
      remaining: 0,
      exceeded: true,
      allowed: false,
      enforced: true,
    };
  }

  const usageAfterReservation = initialState.limit - newRemaining;
  if (newRemaining === 0) {
    await localRedisClient.setRequestLimitFlag(
      tenantId,
      buildLimitFlagPayload({
        limit: initialState.limit,
        usage: usageAfterReservation,
        periodKey: initialState.periodKey,
        resetAt: initialState.resetAt,
      }),
      ttlSeconds,
      initialState.periodKey
    );
  } else {
    await localRedisClient.clearRequestLimitFlag(tenantId, initialState.periodKey);
  }

  return {
    ...initialState,
    usage: usageAfterReservation,
    remaining: newRemaining,
    exceeded: newRemaining === 0,
    allowed: true,
    enforced: true,
  };
}

async function refreshAllTenantRequestStates(date = new Date()) {
  const tenants = await Tenant.find({ status: 'active' }).populate('currentPlan');
  const results = [];

  for (const tenant of tenants) {
    results.push(await refreshMonthlyLimitFlag(tenant._id.toString(), date, { tenant }));
  }

  return {
    refreshed: results.length,
    tenants: results.map(item => ({
      tenantId: item.tenant?._id?.toString?.() || null,
      usage: item.usage ?? 0,
      limit: item.limit ?? null,
      exceeded: item.exceeded ?? false,
      periodKey: item.periodKey ?? null,
    })),
  };
}

module.exports = {
  FOUR_HOUR_PERIOD,
  USAGE_KEY_TTL_SECONDS,
  getFourHourPeriod,
  getPreviousFourHourPeriod,
  getUtcDayRange,
  getUtcWeekRange,
  getUtcMonthRange,
  getMonthKey,
  getBillingCycleRange,
  getRequestStateTtlSeconds,
  getUsageStats,
  getMonthlyUsage,
  getCurrentFourHourUsage,
  getUsageForRange,
  refreshMonthlyLimitFlag,
  refreshAllTenantRequestStates,
  reserveRequestQuota,
  resolveRequestLimitState,
};
