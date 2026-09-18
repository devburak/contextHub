import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { Account, Tenant, BillingAccount, BillingCheckoutSession, BillingEvent, BillingSubscription, BillingPlanChange, PlanPrice, SubscriptionPlan } = require('@contexthub/common');
const billing = require('./billingService');
const webhook = require('./billingWebhookService');
const provider = require('./iyzicoProvider');
const entitlements = require('../tenantSubscriptionService');
const { mailService } = require('../mailService');

describe('iyzico verified payment completion', () => {
  let events, subscription, tenant, sendMail;
  beforeEach(() => {
    vi.stubEnv('ACCOUNT_BILLING_ENABLED', 'true');
    vi.stubEnv('BILLING_CUSTOMER_NOTIFICATIONS_ENABLED', 'true');
    vi.stubEnv('BILLING_PII_ENCRYPTION_KEY', '1'.repeat(64));
    vi.stubEnv('HOSTED_OPERATIONS_NOTIFICATIONS_ENABLED', 'true');
    vi.stubEnv('HOSTED_OPERATIONS_NOTIFICATION_RECIPIENT', 'iletisim@ikon-x.com.tr');
    events = new Map();
    tenant = { _id: 'tenant-1', accountId: 'account-1', name: 'Canary', slug: 'canary', plan: 'pro', status: 'active' };
    subscription = { _id: 'subscription-1', tenantId: tenant._id, accountId: tenant.accountId,
      externalSubscriptionId: 'sub-ref', provider: 'iyzico', planPriceId: 'price-1', planId: 'plan-1',
      amountMinor: 49900, currency: 'TRY', interval: 'month', save: vi.fn().mockResolvedValue() };
    vi.spyOn(BillingSubscription, 'findOne').mockResolvedValue(subscription);
    vi.spyOn(Tenant, 'findById').mockResolvedValue(tenant);
    vi.spyOn(Account, 'findById').mockResolvedValue({ _id: tenant.accountId });
    vi.spyOn(PlanPrice, 'findById').mockResolvedValue({ externalPriceId: 'plan-ref' });
    vi.spyOn(SubscriptionPlan, 'findById').mockReturnValue({ select: () => ({ lean: async () => ({ slug: 'pro' }) }) });
    vi.spyOn(BillingAccount, 'findOne').mockReturnValue({ select: () => ({ lean: async () => ({ billingEmail: 'owner@example.test' }) }) });
    vi.spyOn(entitlements, 'syncEntitlementState').mockResolvedValue();
    sendMail = vi.spyOn(mailService, 'sendMail').mockResolvedValue({ messageId: 'smtp-accepted' });
    vi.spyOn(BillingEvent, 'create').mockImplementation(async (data) => {
      if (events.has(data.eventId)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      const event = { ...data, _id: data.eventId, status: 'pending', attempts: 0, save: vi.fn().mockResolvedValue() };
      events.set(data.eventId, event);
      return event;
    });
    vi.spyOn(BillingEvent, 'findOne').mockImplementation(async ({ eventId }) => events.get(eventId));
    vi.spyOn(BillingEvent, 'findById').mockImplementation(async (id) => events.get(id));
    vi.spyOn(BillingEvent, 'findOneAndUpdate').mockImplementation(async ({ _id }) => {
      const event = events.get(_id);
      if (!event || !['pending', 'failed'].includes(event.status)) return null;
      event.status = 'processing';
      event.attempts += 1;
      return event;
    });
    vi.spyOn(provider, 'retrieveSubscription').mockResolvedValue({ data: {
      referenceCode: 'sub-ref', pricingPlanReferenceCode: 'plan-ref',
      orders: [
        { referenceCode: 'future-order', orderStatus: 'WAITING', price: 499, currencyCode: 'TRY' },
        { referenceCode: 'paid-order', orderStatus: 'SUCCESS', price: 499, currencyCode: 'TRY', startPeriod: 1789749630690 },
      ],
    } });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  const signedEvent = () => ({ _id: 'signed', eventType: 'subscription.order.success',
    externalSubscriptionId: 'sub-ref', occurredAt: new Date(1789749630690),
    payload: { orderReferenceCode: 'paid-order' }, save: vi.fn().mockResolvedValue() });

  it('verifies a real successful order, skips future orders, and deduplicates the later webhook', async () => {
    const job = await webhook.queueIyzicoCheckoutReconciliation(subscription);
    await webhook.processEvent(job._id);
    await webhook.processEvent(job._id);
    await webhook.processIyzicoEvent(signedEvent());
    expect(provider.retrieveSubscription).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(sendMail.mock.calls.map(([message]) => message.to).sort()).toEqual(['iletisim@ikon-x.com.tr', 'owner@example.test']);
    expect(sendMail.mock.calls.find(([message]) => message.to === 'iletisim@ikon-x.com.tr')[0].subject).toContain('Ödeme alındı');
    expect(events.get('payment-notification:paid-order').payload.messageId).toBe('smtp-accepted');
    expect(events.get('customer-payment-notification:paid-order').payload.messageId).toBe('smtp-accepted');
    expect(JSON.stringify(events.get('customer-payment-notification:paid-order').payload)).not.toContain('owner@example.test');
    expect(events.has('payment-notification:future-order')).toBe(false);
  });

  it('deduplicates callback reconciliation when the webhook already sent the email', async () => {
    await webhook.processIyzicoEvent(signedEvent());
    const job = await webhook.queueIyzicoCheckoutReconciliation(subscription);
    await webhook.processEvent(job._id);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('keeps SMTP failure retryable without discarding the verified payment', async () => {
    let failed = false;
    sendMail.mockImplementation(async ({ to }) => {
      if (to === 'iletisim@ikon-x.com.tr' && !failed) { failed = true; throw new Error('SMTP unavailable'); }
      return { messageId: 'smtp-accepted' };
    });
    const job = await webhook.queueIyzicoCheckoutReconciliation(subscription);
    await expect(webhook.processEvent(job._id)).rejects.toThrow('SMTP unavailable');
    expect(events.get('payment-notification:paid-order').status).toBe('failed');
    await webhook.processEvent(job._id);
    expect(events.get('payment-notification:paid-order').status).toBe('processed');
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(sendMail.mock.calls.filter(([message]) => message.to === 'owner@example.test')).toHaveLength(1);
  });

  it('retries customer SMTP independently without resending operations or redirecting the recipient', async () => {
    let failed = false;
    sendMail.mockImplementation(async ({ to }) => {
      if (to === 'owner@example.test' && !failed) { failed = true; throw new Error('Customer SMTP unavailable'); }
      return { messageId: 'smtp-accepted' };
    });
    const job = await webhook.queueIyzicoCheckoutReconciliation(subscription);
    await webhook.processEvent(job._id);
    expect(job.status).toBe('processed');
    const customer = events.get('customer-payment-notification:paid-order');
    expect(customer.status).toBe('failed');
    BillingAccount.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ billingEmail: 'changed@example.test' }) }) });
    await webhook.processEvent(customer._id);
    await webhook.processEvent(customer._id);
    await webhook.processIyzicoEvent(signedEvent());
    expect(customer.status).toBe('processed');
    expect(sendMail.mock.calls.filter(([message]) => message.to === 'iletisim@ikon-x.com.tr')).toHaveLength(1);
    expect(sendMail.mock.calls.filter(([message]) => message.to === 'owner@example.test')).toHaveLength(2);
    expect(sendMail.mock.calls.some(([message]) => message.to === 'changed@example.test')).toBe(false);
  });

  it('sends the customer confirmation even if operations notifications are disabled', async () => {
    vi.stubEnv('HOSTED_OPERATIONS_NOTIFICATIONS_ENABLED', 'false');
    await webhook.processIyzicoEvent(signedEvent());
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('owner@example.test');
  });

  it('preserves the operations-only flow until customer notifications are enabled', async () => {
    vi.stubEnv('BILLING_CUSTOMER_NOTIFICATIONS_ENABLED', 'false');
    await webhook.processIyzicoEvent(signedEvent());
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('iletisim@ikon-x.com.tr');
    expect(events.has('customer-payment-notification:paid-order')).toBe(false);
  });

  it('retries invalid billing-address queueing without repeating the accepted operations email', async () => {
    BillingAccount.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ billingEmail: 'invalid-address' }) }) });
    const job = await webhook.queueIyzicoCheckoutReconciliation(subscription);
    await expect(webhook.processEvent(job._id)).rejects.toThrow('could not be queued');
    expect(events.get('payment-notification:paid-order').payload.notificationSentAt).toBeTruthy();
    BillingAccount.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ billingEmail: 'owner@example.test' }) }) });
    await webhook.processEvent(job._id);
    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(events.get('customer-payment-notification:paid-order').status).toBe('processed');
  });

  it('sends distinct upgrade terms once and retains the recurring amount separately', async () => {
    const change = { externalPaymentId: 'one-off-payment', paidAt: new Date('2026-09-18T19:00:26Z'),
      amountMinor: 50000, currency: 'TRY', toPlanName: 'Pro Max', interval: 'month',
      recurringAmountMinor: 149900, periodEnd: new Date('2026-10-18T19:00:26Z') };
    const job = await webhook.queuePlanChangePaymentNotification(subscription, change);
    await webhook.processEvent(job._id);
    const duplicate = await webhook.queuePlanChangePaymentNotification(subscription, change);
    await webhook.processEvent(duplicate._id);
    const messages = sendMail.mock.calls.filter(([message]) => message.to === 'owner@example.test');
    expect(messages).toHaveLength(1);
    expect(messages[0][0].text).toContain('Paket: Pro Max');
    expect(messages[0][0].text).toContain('Tahsil edilen tutar: 500.00 TRY');
    expect(messages[0][0].text).toContain('Sonraki abonelik tutarı: 1499.00 TRY');
    expect(messages[0][0].text).toContain('tek seferlik');
  });

  it('fails closed for cross-account customer jobs', async () => {
    const source = { ...signedEvent(), provider: 'iyzico', eventType: 'internal.iyzico.payment.notify',
      status: 'processed', tenantId: tenant._id, accountId: 'different-account' };
    await expect(webhook.queueCustomerPaymentNotification(source, subscription, tenant)).rejects.toThrow('scoped');
    expect(sendMail).not.toHaveBeenCalled();
    expect(BillingEvent.create).not.toHaveBeenCalled();
  });

  it('does not notify for an unverified or mismatched subscription', async () => {
    provider.retrieveSubscription.mockResolvedValue({ data: { referenceCode: 'different-sub', pricingPlanReferenceCode: 'plan-ref' } });
    const job = await webhook.queueIyzicoCheckoutReconciliation(subscription);
    await expect(webhook.processEvent(job._id)).rejects.toThrow('mismatch');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not treat ACTIVE or a waiting order alone as a captured payment', async () => {
    provider.retrieveSubscription.mockResolvedValue({ data: { referenceCode: 'sub-ref', pricingPlanReferenceCode: 'plan-ref', subscriptionStatus: 'ACTIVE', orders: [] } });
    const job = await webhook.queueIyzicoCheckoutReconciliation(subscription);
    await expect(webhook.processEvent(job._id)).rejects.toThrow('not available yet');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('retries a webhook which arrives before the callback creates its subscription', async () => {
    BillingSubscription.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await expect(webhook.processIyzicoEvent(signedEvent())).rejects.toThrow('No matching iyzico subscription yet');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('ignores a late event for the predecessor subscription after a plan upgrade', async () => {
    vi.spyOn(entitlements, 'applyPlanToTenant');
    BillingSubscription.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ previousExternalSubscriptionId: 'sub-ref' });
    const event = signedEvent();
    await webhook.processIyzicoEvent(event);
    expect(event.status).toBe('ignored');
    expect(sendMail).not.toHaveBeenCalled();
    expect(entitlements.applyPlanToTenant).not.toHaveBeenCalled();
  });

  it.each(['internal.iyzico.payment.notify', 'internal.iyzico.payment.customer.notify'])('never accepts an internal job through the public webhook verifier: %s', async (eventType) => {
    vi.spyOn(provider, 'verifySubscriptionWebhook').mockReturnValue({});
    await expect(webhook.acceptIyzicoEvent({ iyziEventType: eventType }, 'signature'))
      .rejects.toThrow('Unsupported');
    expect(BillingEvent.create).not.toHaveBeenCalled();
  });

  function upgradedOrder({ oldPeriod = false, status = 'SUCCESS', price = 1499 } = {}) {
    subscription.planChangeId = 'change-1';
    subscription.amountMinor = 149900;
    subscription.currentPeriodStart = new Date('2026-09-01Z');
    subscription.currentPeriodEnd = new Date('2026-10-01Z');
    vi.spyOn(BillingPlanChange, 'findById').mockResolvedValue({ paidAt: new Date('2026-09-16Z'), currentAmountMinor: 49900, currency: 'TRY',
      periodStart: new Date('2026-09-01Z'), periodEnd: new Date('2026-10-01Z') });
    provider.retrieveSubscription.mockResolvedValue({ data: {
      referenceCode: 'sub-ref', pricingPlanReferenceCode: 'plan-ref', orders: [{
        referenceCode: 'renewal-order', orderStatus: status, currencyCode: 'TRY', price,
        startPeriod: +new Date(oldPeriod ? '2026-09-01Z' : '2026-10-01Z'), endPeriod: +new Date(oldPeriod ? '2026-10-01Z' : '2026-11-01Z'),
      }],
    } });
    return { ...signedEvent(), occurredAt: new Date('2026-10-01Z'), payload: { orderReferenceCode: 'renewal-order' } };
  }
  it('verifies a new-plan renewal and advances to its actual provider period', async () => {
    const event = upgradedOrder();
    await webhook.processIyzicoEvent(event);
    expect(subscription.currentPeriodStart).toEqual(new Date('2026-10-01Z'));
    expect(subscription.currentPeriodEnd).toEqual(new Date('2026-11-01Z'));
    expect(event.status).toBe('processed');
    expect(events.get('payment-notification:renewal-order').payload.amountMinor).toBe(149900);
  });
  it('ignores old-period history even when the provider returns the same reference', async () => {
    const event = upgradedOrder({ oldPeriod: true, price: 499 });
    await webhook.processIyzicoEvent(event);
    expect(event.status).toBe('ignored');
    expect(subscription.save).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });
  it('does not treat a pending child or waiting order as a successful renewal', async () => {
    const event = upgradedOrder({ status: 'WAITING' });
    await expect(webhook.processIyzicoEvent(event)).rejects.toThrow('could not be verified');
    expect(subscription.save).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('does not drop a payment notification just because a newer subscription event exists', async () => {
    subscription.lastProviderEventAt = new Date(1789749730690);
    const event = signedEvent();
    await webhook.processIyzicoEvent(event);
    expect(event.status).toBe('ignored');
    expect(subscription.save).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('scopes checkout status to both the authenticated tenant and its account', async () => {
    Tenant.findById.mockReturnValue({ select: () => ({ populate: async () => tenant }) });
    const lookup = vi.spyOn(BillingCheckoutSession, 'findOne').mockReturnValue({
      select: () => ({ lean: async () => ({ status: 'completed', checkoutMode: 'subscription' }) }),
    });
    await expect(billing.getCheckoutStatus('tenant-1', 'session-1')).resolves.toEqual({ status: 'completed', reviewCheckout: false });
    expect(lookup).toHaveBeenCalledWith({ _id: 'session-1', tenantId: 'tenant-1', accountId: 'account-1' });
    lookup.mockReturnValue({ select: () => ({ lean: async () => null }) });
    await expect(billing.getCheckoutStatus('tenant-1', 'other-tenant-session')).rejects.toMatchObject({ statusCode: 404 });
  });
});
