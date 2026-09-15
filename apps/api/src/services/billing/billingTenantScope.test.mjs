import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  Account,
  BillingEvent,
  BillingInvoice,
  BillingSubscription,
  SubscriptionPlan,
} = require('@contexthub/common');
const { DEFAULT_SUBSCRIPTION_PLANS } = require('../../lib/defaultSubscriptionPlans');

describe('tenant-scoped billing contract', () => {
  it('keeps plan and quota ownership on Tenant rather than Account', () => {
    expect(Account.schema.path('plan')).toBeUndefined();
    expect(Account.schema.path('currentPlan')).toBeUndefined();
    expect(Account.schema.path('tenantLimit')).toBeUndefined();
    expect(Account.schema.path('customLimits')).toBeUndefined();
    expect(SubscriptionPlan.schema.path('tenantLimit')).toBeUndefined();
  });

  it('keys subscriptions and billing history to a tenant', () => {
    expect(BillingSubscription.schema.path('tenantId')?.options.required).toBe(true);
    expect(BillingSubscription.schema.path('tenantId')?.options.unique).toBe(true);
    expect(BillingSubscription.schema.path('accountId')?.options.unique).not.toBe(true);
    expect(BillingInvoice.schema.path('tenantId')?.options.required).toBe(true);
    expect(BillingEvent.schema.path('tenantId')).toBeTruthy();
  });

  it('does not market plans as bundles of sites or tenants', () => {
    for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
      expect(plan).not.toHaveProperty('tenantLimit');
      const capabilityText = (plan.capabilities || [])
        .map((capability) => `${capability.label} ${capability.description}`)
        .join(' ')
        .toLowerCase();
      expect(capabilityText).not.toMatch(/\b(?:1|5|15)\s+sites?\b/);
    }
  });

  it('keeps Free single-user with invitations disabled by policy', () => {
    const free = DEFAULT_SUBSCRIPTION_PLANS.find((plan) => plan.slug === 'free');
    expect(free?.userLimit).toBe(1);
    expect(free?.ownerLimit).toBe(1);
  });

  it('keeps Enterprise collection internal while exposing shadow usage rates', () => {
    const enterprise = DEFAULT_SUBSCRIPTION_PLANS.find((plan) => plan.slug === 'enterprise');

    expect(enterprise?.billingType).toBe('fixed');
    expect(enterprise?.pricePerGBStorage).toBe(1);
    expect(enterprise?.pricePerThousandRequests).toBe(0.1);
    expect(BillingInvoice.schema.path('commercialModel')?.options.select).toBe(false);
  });
});
