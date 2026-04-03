import { describe, it, expect } from 'vitest';
import apiUsageService from './apiUsageService.js';

const {
  getBillingCycleRange,
  getFourHourPeriod,
  getPreviousFourHourPeriod,
} = apiUsageService;

describe('apiUsageService period helpers', () => {
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
});
