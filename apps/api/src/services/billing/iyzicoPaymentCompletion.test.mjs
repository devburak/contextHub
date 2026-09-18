import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { Account, Tenant, BillingAccount, BillingCheckoutSession, BillingEvent, BillingSubscription, PlanPrice, SubscriptionPlan } = require('@contexthub/common');
const billing = require('./billingService');
const webhook = require('./billingWebhookService');
const provider = require('./iyzicoProvider');
const entitlements = require('../tenantSubscriptionService');
const { mailService } = require('../mailService');

describe('iyzico verified payment completion', () => {
  let events, subscription, tenant, sendMail;
  beforeEach(() => {
    vi.stubEnv('ACCOUNT_BILLING_ENABLED', 'true');
    vi.stubEnv('HOSTED_OPERATIONS_NOTIFICATIONS_ENABLED', 'true');
    vi.stubEnv('HOSTED_OPERATIONS_NOTIFICATION_RECIPIENT', 'iletisim@ikon-x.com.tr');
    events = new Map();
    tenant = { _id: 'tenant-1', accountId: 'account-1', name: 'Canary', slug: 'canary', plan: 'pro', status: 'active' };
    subscription = { _id: 'subscription-1', tenantId: tenant._id, accountId: tenant.accountId,
      externalSubscriptionId: 'sub-ref', provider: 'iyzico', planPriceId: 'price-1', planId: 'plan-1',
      amountMinor: 49900, currency: 'TRY', save: vi.fn().mockResolvedValue() };
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
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe('iletisim@ikon-x.com.tr');
    expect(sendMail.mock.calls[0][0].subject).toContain('Ödeme alındı');
    expect(events.get('payment-notification:paid-order').payload.messageId).toBe('smtp-accepted');
    expect(events.has('payment-notification:future-order')).toBe(false);
  });

  it('deduplicates callback reconciliation when the webhook already sent the email', async () => {
    await webhook.processIyzicoEvent(signedEvent());
    const job = await webhook.queueIyzicoCheckoutReconciliation(subscription);
    await webhook.processEvent(job._id);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it('keeps SMTP failure retryable without discarding the verified payment', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP unavailable'));
    const job = await webhook.queueIyzicoCheckoutReconciliation(subscription);
    await expect(webhook.processEvent(job._id)).rejects.toThrow('SMTP unavailable');
    expect(events.get('payment-notification:paid-order').status).toBe('failed');
    await webhook.processEvent(job._id);
    expect(events.get('payment-notification:paid-order').status).toBe('processed');
    expect(sendMail).toHaveBeenCalledTimes(2);
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
    BillingSubscription.findOne.mockResolvedValueOnce(null);
    await expect(webhook.processIyzicoEvent(signedEvent())).rejects.toThrow('No matching iyzico subscription yet');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('never accepts an internal notification job through the public webhook verifier', async () => {
    vi.spyOn(provider, 'verifySubscriptionWebhook').mockReturnValue({});
    await expect(webhook.acceptIyzicoEvent({ iyziEventType: 'internal.iyzico.payment.notify' }, 'signature'))
      .rejects.toThrow('Unsupported');
    expect(BillingEvent.create).not.toHaveBeenCalled();
  });

  it('does not drop a payment notification just because a newer subscription event exists', async () => {
    subscription.lastProviderEventAt = new Date(1789749730690);
    const event = signedEvent();
    await webhook.processIyzicoEvent(event);
    expect(event.status).toBe('ignored');
    expect(subscription.save).not.toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledTimes(1);
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
