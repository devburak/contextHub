import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { BillingAccount, BillingPlanChange: Change, BillingSubscription: Subscription, PlanPrice, Tenant } = require('@contexthub/common');
const service = require('./planChangeService');
const billing = require('./billingService');
const provider = require('./iyzicoProvider');
const webhook = require('./billingWebhookService');
const entitlements = require('../tenantSubscriptionService');
const { encryptBillingPii } = require('./billingPiiCrypto');

function match(row, filter) {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') return value.some((entry) => match(row, entry));
    if (value === null) return row[key] == null;
    if (value?.$in) return value.$in.includes(row[key]);
    if (value?.$lte) return row[key] <= value.$lte;
    if (value?.$gt) return row[key] > value.$gt;
    return String(row[key]) === String(value);
  });
}
const query = (value) => ({ select: () => Promise.resolve(value), then: (resolve, reject) => Promise.resolve(value).then(resolve, reject) });

describe('durable immediate upgrade', () => {
  let change, subscription, tenant, price;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-16T00:00:00Z'));
    vi.stubEnv('BILLING_PII_ENCRYPTION_KEY', '22'.repeat(32));
    change = { _id: 'change-1', tenantId: 'tenant-1', accountId: 'account-1', subscriptionId: 'sub-1', actorUserId: 'user-1',
      active: true, status: 'awaiting_payment', fromPriceId: 'price-pro', toPriceId: 'price-max',
      fromExternalPriceId: 'pro-ref', toExternalPriceId: 'max-ref',
      fromPlanName: 'Pro', toPlanName: 'Pro Max', currentAmountMinor: 49900, recurringAmountMinor: 149900,
      amountMinor: 50000, currency: 'TRY', interval: 'month',
      periodStart: new Date('2026-09-01Z'), periodEnd: new Date('2026-10-01Z'),
      checkoutExpiresAt: new Date(Date.now() + 1800000), conversationId: 'ctx_upgrade_change-1',
      externalSubscriptionId: 'old-ref', tokenEncrypted: encryptBillingPii('token'), save: vi.fn(async () => {}) };
    subscription = { _id: 'sub-1', tenantId: 'tenant-1', accountId: 'account-1', provider: 'iyzico', status: 'active', externalSubscriptionId: 'old-ref', planId: 'pro', planPriceId: 'price-pro' };
    tenant = { _id: 'tenant-1', accountId: 'account-1', status: 'active', plan: 'pro', billingCycleStart: new Date('2026-09-01Z') };
    price = { _id: 'price-max', amountMinor: 149900, externalPriceId: 'max-ref', provider: 'iyzico', currency: 'TRY', interval: 'month', planId: { _id: 'plan-max', slug: 'promax' } };
    vi.spyOn(Change, 'findById').mockImplementation(() => query(change));
    vi.spyOn(Change, 'findOne').mockImplementation(async (filter) => match(change, filter) ? change : null);
    vi.spyOn(Change, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
      if (!match(change, filter)) return null;
      Object.assign(change, update.$set); return change;
    });
    vi.spyOn(Change, 'updateOne').mockImplementation(async (_filter, update) => { Object.assign(change, update.$set); return { matchedCount: 1 }; });
    vi.spyOn(Subscription, 'findById').mockResolvedValue(subscription);
    vi.spyOn(Subscription, 'updateOne').mockImplementation(async (_filter, update) => { Object.assign(subscription, update.$set); return { matchedCount: 1 }; });
    vi.spyOn(Subscription, 'findOneAndUpdate').mockImplementation(async (_filter, update) => { Object.assign(subscription, update.$set); return subscription; });
    vi.spyOn(Tenant, 'findById').mockResolvedValue(tenant);
    vi.spyOn(Tenant, 'updateOne').mockResolvedValue({ matchedCount: 1 });
    vi.spyOn(PlanPrice, 'findById').mockReturnValue({ populate: async () => price });
    vi.spyOn(provider, 'retrieveReviewCheckout').mockResolvedValue({ paymentStatus: 'SUCCESS', paidPrice: '500.00', price: '500.00', currency: 'TRY', paymentId: 'payment-1' });
    vi.spyOn(provider, 'verifyReviewCheckoutResponse').mockImplementation((result) => result);
    vi.spyOn(provider, 'schedulePlanChange').mockResolvedValue({ data: { referenceCode: 'new-ref', pricingPlanReferenceCode: 'max-ref', subscriptionStatus: 'PENDING' } });
    vi.spyOn(provider, 'createPlanChangeCheckout').mockResolvedValue({});
    vi.spyOn(entitlements, 'applyPlanToTenant').mockImplementation(async (target, slug) => { target.plan = slug; target.currentPlan = 'plan-max'; });
    vi.spyOn(entitlements, 'syncEntitlementState').mockResolvedValue({});
    vi.spyOn(webhook, 'queuePlanChangePaymentNotification').mockResolvedValue({});
    vi.spyOn(billing, 'getAccountForTenant').mockResolvedValue({ tenant, account: { _id: 'account-1' } });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

  it('verifies the exact difference, unlocks immediately, schedules once, preserves period anchors', async () => {
    const result = await service.reconcileOne(change._id);
    expect(result.status).toBe('completed');
    expect(provider.verifyReviewCheckoutResponse).toHaveBeenCalledWith(expect.anything(), { checkoutToken: 'token', conversationId: 'ctx_upgrade_change-1' });
    expect(entitlements.applyPlanToTenant).toHaveBeenCalledWith(tenant, 'promax', { source: 'provider_checkout', trackActivation: false });
    expect(provider.schedulePlanChange).toHaveBeenCalledOnce();
    expect(provider.createPlanChangeCheckout).not.toHaveBeenCalled();
    expect(subscription.externalSubscriptionId).toBe('new-ref');
    expect(subscription.previousExternalSubscriptionId).toBe('old-ref');
    expect(subscription.currentPeriodEnd).toEqual(new Date('2026-10-01Z'));
    expect(tenant.billingCycleStart).toEqual(new Date('2026-09-01Z'));
    expect(change.tokenEncrypted).toBeUndefined();
    await service.reconcileOne(change._id);
    expect(provider.schedulePlanChange).toHaveBeenCalledOnce();
    expect(webhook.queuePlanChangePaymentNotification).toHaveBeenCalledOnce();
  });

  it.each([{ paidPrice: '500.01' }, { price: '1000' }, { currency: 'USD' }, { paymentId: '' }])('never grants access for mismatched payment %j', async (override) => {
    provider.retrieveReviewCheckout.mockResolvedValue({ paymentStatus: 'SUCCESS', paidPrice: '500', price: '500', currency: 'TRY', paymentId: 'payment-1', ...override });
    expect((await service.reconcileOne(change._id)).status).toBe('needs_review');
    expect(entitlements.applyPlanToTenant).not.toHaveBeenCalled();
    expect(provider.schedulePlanChange).not.toHaveBeenCalled();
  });
  it('never grants access for an invalid response signature', async () => {
    provider.verifyReviewCheckoutResponse.mockImplementation(() => { throw new Error('signature mismatch'); });
    await service.reconcileOne(change._id);
    expect(change.paidAt).toBeUndefined();
    expect(entitlements.applyPlanToTenant).not.toHaveBeenCalled();
  });
  it('does not grant access or release the intent for a failed payment on a retryable form', async () => {
    provider.retrieveReviewCheckout.mockResolvedValue({ paymentStatus: 'FAILURE' });
    expect((await service.reconcileOne(change._id)).status).toBe('awaiting_payment');
    expect(change.active).toBe(true);
    expect(entitlements.applyPlanToTenant).not.toHaveBeenCalled();
  });
  it('keeps a verified payment and access after ambiguous upgrade failure, never retries the charge or upgrade', async () => {
    provider.schedulePlanChange.mockRejectedValue(new Error('timeout after acceptance'));
    expect((await service.reconcileOne(change._id)).status).toBe('needs_review');
    expect(change.paidAt).toBeTruthy();
    expect(change.entitlementAppliedAt).toBeTruthy();
    await service.reconcileOne(change._id);
    expect(provider.schedulePlanChange).toHaveBeenCalledOnce();
    expect(provider.createPlanChangeCheckout).not.toHaveBeenCalled();
  });
  it.each(['cancellation', 'deleted', 'late'])('holds a paid change for manual resolution when %s', async (reason) => {
    if (reason === 'cancellation') subscription.cancellationRequestedAt = new Date();
    if (reason === 'deleted') tenant.status = 'deleted';
    if (reason === 'late') change.periodEnd = new Date(Date.now() - 1);
    expect((await service.reconcileOne(change._id)).status).toBe('needs_review');
    expect(change.paidAt).toBeTruthy();
    expect(provider.schedulePlanChange).not.toHaveBeenCalled();
  });
  it('rejects status lookup for another tenant/account before processing any payment', async () => {
    billing.getAccountForTenant.mockResolvedValue({ tenant: { _id: 'other-tenant' }, account: { _id: 'other-account' } });
    await expect(service.getStatus('other-tenant', change._id)).rejects.toMatchObject({ statusCode: 404 });
    expect(provider.retrieveReviewCheckout).not.toHaveBeenCalled();
  });
  it('redacts payment/provider identifiers and checkout credentials from UI payloads', () => {
    const visible = service.serialize(change);
    for (const field of ['tokenEncrypted', 'tokenHash', 'externalSubscriptionId', 'externalPaymentId', 'conversationId', 'lastError']) expect(visible).not.toHaveProperty(field);
    expect(visible.amountMinor).toBe(50000);
  });

  function prepareQuote() {
    vi.stubEnv('ACCOUNT_BILLING_ENABLED', 'true');
    vi.stubEnv('BILLING_PLAN_CHANGES_ENABLED', 'true');
    vi.stubEnv('BILLING_ENABLED_PROVIDERS', 'iyzico');
    vi.stubEnv('BILLING_CHECKOUT_TENANT_IDS', 'tenant-1');
    tenant.currentPlan = { slug: 'pro' };
    Object.assign(subscription, { planId: { slug: 'pro', name: 'Pro' }, planPriceId: { _id: 'price-pro', externalPriceId: 'pro-ref' }, amountMinor: 49900, currency: 'TRY', interval: 'month' });
    Object.assign(price, { active: true, provider: 'iyzico', currency: 'TRY', interval: 'month' });
    price.planId.name = 'Pro Max';
    vi.spyOn(Subscription, 'findOne').mockReturnValue({ populate: async () => subscription });
    const profile = { country: 'TR', provider: 'iyzico', taxId: '11111111111' };
    vi.spyOn(BillingAccount, 'findOne').mockReturnValue({ select: async () => ({ ...profile, toObject: () => profile }) });
    vi.spyOn(billing, 'serializeBillingAccount').mockReturnValue({ profileComplete: true, commercialReadiness: { agreementAccepted: true } });
    vi.spyOn(provider, 'retrieveSubscription').mockResolvedValue({ data: {
      referenceCode: 'old-ref', subscriptionStatus: 'ACTIVE', pricingPlanReferenceCode: 'pro-ref',
      orders: [{ orderStatus: 'SUCCESS', price: 499, currencyCode: 'TRY', startPeriod: +new Date('2026-09-01Z'), endPeriod: +new Date('2026-10-01Z') }],
    } });
    vi.spyOn(provider, 'retrievePricingPlan').mockImplementation(async (id) => ({ data: {
      referenceCode: id, productReferenceCode: 'cloud', status: 'ACTIVE', currencyCode: 'TRY', paymentInterval: 'MONTHLY',
      paymentIntervalCount: 1, planPaymentType: 'RECURRING', price: id === 'pro-ref' ? 499 : 1499,
    } }));
    vi.spyOn(Change, 'updateMany').mockResolvedValue({});
    vi.spyOn(Change, 'create').mockImplementation(async (data) => ({ ...data, _id: 'new-quote', status: 'quoted' }));
    change.active = false;
  }
  it('quotes the provider-verified remaining period without creating any payment', async () => {
    prepareQuote();
    const result = await service.createQuote('tenant-1', 'price-max', 'user-1');
    expect(result.amountMinor).toBe(50000);
    expect(result.recurringAmountMinor).toBe(149900);
    expect(result.taxIncluded).toBe(true);
    expect(result.quoteExpiresAt).toEqual(new Date(Date.now() + 300000));
    expect(provider.createPlanChangeCheckout).not.toHaveBeenCalled();
  });
  it.each(['flag', 'allowlist', 'interval', 'currency', 'country', 'providerCanceled', 'providerPrice', 'product', 'trialing', 'profile'])('refuses an unsafe quote: %s', async (kind) => {
    prepareQuote();
    if (kind === 'flag') vi.stubEnv('BILLING_PLAN_CHANGES_ENABLED', 'false');
    if (kind === 'allowlist') vi.stubEnv('BILLING_CHECKOUT_TENANT_IDS', 'other-tenant');
    if (kind === 'interval') price.interval = 'year';
    if (kind === 'currency') price.currency = 'USD';
    if (kind === 'country') BillingAccount.findOne.mockReturnValue({ select: async () => ({ country: 'US' }) });
    if (kind === 'providerCanceled') provider.retrieveSubscription.mockResolvedValue({ data: { subscriptionStatus: 'CANCELED' } });
    if (kind === 'providerPrice') provider.retrievePricingPlan.mockResolvedValue({ data: { price: 2000 } });
    if (kind === 'product') provider.retrievePricingPlan.mockResolvedValue({ data: { productReferenceCode: 'wrong' } });
    if (kind === 'trialing') subscription.status = 'trialing';
    if (kind === 'profile') billing.serializeBillingAccount.mockReturnValue({ profileComplete: false, commercialReadiness: {} });
    await expect(service.createQuote('tenant-1', 'price-max', 'user-1')).rejects.toThrow();
    expect(Change.create).not.toHaveBeenCalled();
    expect(provider.createPlanChangeCheckout).not.toHaveBeenCalled();
  });
  it('requires the quote owner and an unexpired accepted quote', async () => {
    prepareQuote(); change.active = true; change.status = 'quoted'; change.quoteExpiresAt = new Date(Date.now() - 1);
    await expect(service.confirm('tenant-1', change._id, { actorUserId: 'other-user' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.confirm('tenant-1', change._id, { actorUserId: 'user-1' })).rejects.toMatchObject({ code: 'PlanChangeQuoteExpired' });
    expect(provider.createPlanChangeCheckout).not.toHaveBeenCalled();
  });
  it('claims confirmation atomically and never initializes a second form', async () => {
    prepareQuote(); change.active = true; change.status = 'quoted'; change.quoteExpiresAt = new Date(Date.now() + 300000);
    provider.createPlanChangeCheckout.mockResolvedValue({ checkoutToken: 'one-token', checkoutContent: '<p>one form</p>', expiresInSeconds: 1800 });
    const first = await service.confirm('tenant-1', change._id, { actorUserId: 'user-1' });
    const second = await service.confirm('tenant-1', change._id, { actorUserId: 'user-1' });
    expect(first.checkoutContent).toBe('<p>one form</p>');
    expect(second.checkoutContent).toBe(first.checkoutContent);
    expect(first).not.toHaveProperty('checkoutToken');
    expect(provider.createPlanChangeCheckout).toHaveBeenCalledOnce();
  });
});
