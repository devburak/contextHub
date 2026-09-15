import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import apiUsageService from './apiUsageService.js';

const require = createRequire(import.meta.url);
const ApiUsage = require('@contexthub/common/src/models/ApiUsage');
const Tenant = require('@contexthub/common/src/models/Tenant');
const localRedisClient = require('../lib/localRedis');
const tenantSubscriptionService = require('./tenantSubscriptionService');

const {
  getBillingCycleRange,
  getFourHourPeriod,
  getPreviousFourHourPeriod,
} = apiUsageService;

describe('apiUsageService period helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a timestamp into the correct 4-hour window', () => {
    const period = getFourHourPeriod(new Date('2026-03-04T13:45:00.000Z'));

    expect(period.periodKey).toBe('2026-03-04T12');
    expect(period.startDate.toISOString()).toBe('2026-03-04T12:00:00.000Z');
    expect(period.endExclusive.toISOString()).toBe('2026-03-04T16:00:00.000Z');
  });

  it('resolves the previous 4-hour period across day boundaries', () => {
    const period = getPreviousFourHourPeriod(new Date('2026-03-04T00:10:00.000Z'));

    expect(period.periodKey).toBe('2026-03-03T20');
    expect(period.startDate.toISOString()).toBe('2026-03-03T20:00:00.000Z');
    expect(period.endExclusive.toISOString()).toBe('2026-03-04T00:00:00.000Z');
  });

  it('starts the first billing month from the subscription day at UTC midnight', () => {
    const cycle = getBillingCycleRange(
      { subscriptionStartDate: new Date('2026-03-11T15:20:00.000Z') },
      new Date('2026-03-25T10:00:00.000Z')
    );

    expect(cycle.start.toISOString()).toBe('2026-03-11T00:00:00.000Z');
    expect(cycle.endExclusive.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(cycle.cycleKey).toBe('2026-03');
  });

  it('uses calendar month boundaries after the first partial month', () => {
    const cycle = getBillingCycleRange(
      { subscriptionStartDate: new Date('2026-03-11T15:20:00.000Z') },
      new Date('2026-04-25T10:00:00.000Z')
    );

    expect(cycle.start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(cycle.endExclusive.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(cycle.cycleKey).toBe('2026-04');
  });

  it('stores an under-limit quota snapshot for programmatic response headers', async () => {
    const date = new Date('2026-08-01T01:00:00.000Z');
    const tenantId = '64b000000000000000000001';
    const tenant = {
      _id: tenantId,
      subscriptionStartDate: new Date('2026-08-01T00:00:00.000Z'),
    };
    vi.spyOn(tenantSubscriptionService, 'getEffectiveLimit').mockResolvedValue(100);
    vi.spyOn(ApiUsage, 'aggregate').mockResolvedValue([{ totalCalls: 20 }]);
    vi.spyOn(Tenant, 'findByIdAndUpdate').mockResolvedValue(null);
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(localRedisClient, 'getUsageCounter').mockResolvedValue({ pending: 0 });
    vi.spyOn(localRedisClient, 'cacheRequestQuota').mockResolvedValue(true);
    const setSnapshot = vi.spyOn(localRedisClient, 'setRequestLimitFlag').mockResolvedValue(true);

    const state = await apiUsageService.refreshMonthlyLimitFlag(tenantId, date, { tenant });

    expect(state).toMatchObject({ limit: 100, usage: 20, remaining: 80, exceeded: false });
    expect(setSnapshot).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({
        exceeded: false,
        limit: 100,
        usage: 20,
        periodKey: '2026-08',
        resetAt: '2026-09-01T00:00:00.000Z',
      }),
      expect.any(Number),
      '2026-08'
    );
  });
});
