import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
const require = createRequire(import.meta.url);
const { proratedDifference, paidPeriod } = require('./planChangePolicy');
const { BillingPlanChange } = require('@contexthub/common');

describe('remaining-time plan change policy', () => {
  const base = { currentAmountMinor: 49900, nextAmountMinor: 149900,
    periodStart: new Date('2026-09-01T00:00:00Z'), periodEnd: new Date('2026-10-01T00:00:00Z'), now: new Date('2026-09-16T00:00:00Z') };

  it('charges ₺500 once for exactly half the monthly period', () => {
    expect(proratedDifference(base).amountMinor).toBe(50000);
  });
  it('uses real yearly boundaries rather than assuming 30 days', () => {
    expect(proratedDifference({ ...base, currentAmountMinor: 499000, nextAmountMinor: 1499000,
      periodStart: new Date('2024-01-01Z'), periodEnd: new Date('2025-01-01Z'), now: new Date('2024-07-02Z') }).amountMinor).toBe(500000);
  });
  it('rounds a fractional kuruş once, half up', () => {
    expect(proratedDifference({ ...base, currentAmountMinor: 1, nextAmountMinor: 4 }).amountMinor).toBe(2);
  });
  it.each([
    { now: new Date('2026-10-01Z') }, { now: new Date('2026-08-01Z') },
    { periodStart: null }, { periodEnd: 'bad' }, { currentAmountMinor: -100 },
    { currentAmountMinor: 49900.1 }, { nextAmountMinor: 49000 }, { nextAmountMinor: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid or non-upgrade quotes: %j', (override) => {
    expect(() => proratedDifference({ ...base, ...override })).toThrow();
  });
  it('does not trust a locally active subscription after provider cancellation/refund', () => {
    const subscription = { externalSubscriptionId: 'sub', planPriceId: { externalPriceId: 'price' }, amountMinor: 49900, currency: 'TRY' };
    const data = { referenceCode: 'sub', pricingPlanReferenceCode: 'price', subscriptionStatus: 'CANCELED', orders: [] };
    expect(() => paidPeriod(data, subscription, base.now)).toThrow();
  });
  it('requires exactly one successful matching order covering now', () => {
    const subscription = { externalSubscriptionId: 'sub', planPriceId: { externalPriceId: 'price' }, amountMinor: 49900, currency: 'TRY' };
    const order = { orderStatus: 'SUCCESS', price: 499, currencyCode: 'TRY', startPeriod: +base.periodStart, endPeriod: +base.periodEnd };
    const data = { referenceCode: 'sub', pricingPlanReferenceCode: 'price', subscriptionStatus: 'ACTIVE', orders: [order] };
    expect(paidPeriod(data, subscription, base.now)).toEqual({ periodStart: base.periodStart, periodEnd: base.periodEnd });
    for (const orders of [[], [order, order], [{ ...order, currencyCode: 'USD' }], [{ ...order, orderStatus: 'WAITING' }], [{ ...order, price: 1499 }]]) {
      expect(() => paidPeriod({ ...data, orders }, subscription, base.now)).toThrow();
    }
  });
  it('keeps financial intents durable and enforces one active intent per tenant', () => {
    const indexes = BillingPlanChange.schema.indexes();
    expect(indexes.every(([, options]) => options.expireAfterSeconds === undefined)).toBe(true);
    expect(indexes).toContainEqual([{ tenantId: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { active: true } })]);
    expect(BillingPlanChange.schema.path('tokenEncrypted').options.select).toBe(false);
    expect(BillingPlanChange.schema.path('checkoutEncrypted').options.select).toBe(false);
  });
});
