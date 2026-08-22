import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  buildChargeSummary,
  calculateUsageEstimate,
  serializeBillingAccount,
  serializeInvoice,
  serializePrice,
  serializeSubscription,
} = require('./billingService');
const { BillingInvoice } = require('@contexthub/common');

describe('owner-visible billing cost summary', () => {
  const enterprise = {
    slug: 'enterprise',
    name: 'Enterprise',
    price: 250,
    pricePerGBStorage: 1,
    pricePerThousandRequests: 0.1,
  };

  it('calculates an informational Enterprise usage equivalent in minor units', () => {
    const estimate = calculateUsageEstimate(enterprise, {
      storageBytes: 1.5 * (1024 ** 3),
      requestCount: 12500,
    });

    expect(estimate).toMatchObject({
      available: true,
      informational: true,
      currency: 'USD',
      amountMinor: 275,
    });
    expect(estimate.lines).toEqual([
      expect.objectContaining({ metric: 'storage', unitPriceMinor: 100, amountMinor: 150 }),
      expect.objectContaining({ metric: 'requests', unitPriceMinor: 10, amountMinor: 125 }),
    ]);
  });

  it('keeps usage estimates unavailable for fixed self-service plans', () => {
    const estimate = calculateUsageEstimate({ slug: 'pro', pricePerGBStorage: 1 }, {
      storageBytes: 10 * (1024 ** 3),
      requestCount: 50000,
    });

    expect(estimate).toMatchObject({ available: false, amountMinor: 0, lines: [] });
  });

  it('shows the real subscription amount and unified latest invoice without billing mode', () => {
    const invoice = {
      _id: 'invoice-id',
      provider: 'manual',
      commercialModel: 'negotiated_contract',
      invoiceNumber: 'INV-42',
      status: 'paid',
      currency: 'USD',
      subtotalMinor: 24000,
      taxMinor: 1000,
      totalMinor: 25000,
      billedAt: new Date('2026-08-01T00:00:00.000Z'),
      paidAt: new Date('2026-08-02T00:00:00.000Z'),
      periodStart: new Date('2026-08-01T00:00:00.000Z'),
      periodEnd: new Date('2026-09-01T00:00:00.000Z'),
      documentUrl: 'https://example.test/invoice.pdf',
    };
    const summary = buildChargeSummary({
      plan: enterprise,
      subscription: { amountMinor: 25000, currency: 'USD', interval: 'month' },
      invoices: [invoice],
    });

    expect(summary.subscription).toMatchObject({ amountMinor: 25000, isEstimated: false });
    expect(summary.latestInvoice).toMatchObject({ number: 'INV-42', totalMinor: 25000 });
    expect(summary.latestInvoice).not.toHaveProperty('provider');
    expect(summary.latestInvoice).not.toHaveProperty('commercialModel');
    expect(serializeInvoice(invoice)).not.toHaveProperty('provider');
    expect(serializeInvoice(invoice)).not.toHaveProperty('commercialModel');
  });

  it('keeps Enterprise invoice classification internal and excluded by default', () => {
    const path = BillingInvoice.schema.path('commercialModel');

    expect(path.options.enum).toEqual([
      'fixed_subscription',
      'metered_usage',
      'negotiated_contract',
    ]);
    expect(path.options.select).toBe(false);
  });

  it('does not expose provider details in selectable prices', () => {
    const result = serializePrice({
      _id: 'price-id',
      key: 'pro.paddle.month.usd',
      provider: 'paddle',
      interval: 'month',
      currency: 'USD',
      amountMinor: 1200,
      externalPriceId: 'pri_123',
      planId: {
        _id: 'plan-id',
        slug: 'pro',
        name: 'Pro',
        description: 'Pro plan',
        userLimit: 5,
        ownerLimit: 2,
        storageLimit: 3 * (1024 ** 3),
        monthlyRequestLimit: 50000,
      },
    });

    expect(result).not.toHaveProperty('provider');
    expect(result).not.toHaveProperty('key');
    expect(result.checkoutReady).toBe(true);
  });

  it('omits provider and internal identifiers from owner-visible account and subscription data', () => {
    const billingAccount = serializeBillingAccount({
      provider: 'manual',
      externalCustomerId: 'internal-customer-id',
      status: 'active',
      billingEmail: 'owner@example.test',
      legalName: 'Example',
      country: 'TR',
      currency: 'USD',
    });
    const subscription = serializeSubscription({
      _id: 'subscription-id',
      provider: 'manual',
      externalSubscriptionId: 'internal-subscription-id',
      status: 'active',
      interval: 'month',
      currency: 'USD',
      amountMinor: 25000,
      planId: { slug: 'enterprise', name: 'Enterprise' },
    });

    expect(billingAccount).not.toHaveProperty('provider');
    expect(billingAccount).not.toHaveProperty('externalCustomerId');
    expect(billingAccount.hasProviderCustomer).toBe(true);
    expect(subscription).not.toHaveProperty('provider');
    expect(subscription).not.toHaveProperty('externalSubscriptionId');
  });
});
