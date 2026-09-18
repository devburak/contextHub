import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { MockAgent, setGlobalDispatcher, getGlobalDispatcher } = require('undici');
const provider = require('./iyzicoProvider');
const { BillingSubscription, BillingPlanChange } = require('@contexthub/common');
const { requestTenantCancellation } = require('./billingCancellationService');

describe('iyzico plan-change transport contract', () => {
  let original, agent, pool;
  beforeEach(() => {
    original = getGlobalDispatcher(); agent = new MockAgent(); agent.disableNetConnect(); setGlobalDispatcher(agent);
    pool = agent.get('https://sandbox-api.iyzipay.com');
    vi.stubEnv('IYZICO_ENV', 'sandbox'); vi.stubEnv('IYZICO_API_KEY', 'fake-key'); vi.stubEnv('IYZICO_SECRET_KEY', 'fake-secret');
    vi.stubEnv('IYZICO_CALLBACK_URL', 'https://example.test/api/billing/callbacks/iyzico');
  });
  afterEach(async () => { setGlobalDispatcher(original); await agent.close(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it('uses only NEXT_PERIOD with no trial or recurrence reset', async () => {
    let sent;
    pool.intercept({ path: '/v2/subscription/subscriptions/old-ref/upgrade', method: 'POST' }).reply(200, (request) => {
      sent = JSON.parse(request.body); return { status: 'success', data: { referenceCode: 'new-ref' } };
    });
    await provider.schedulePlanChange({ externalSubscriptionId: 'old-ref', externalPriceId: 'new-price' });
    expect(sent).toEqual({ newPricingPlanReferenceCode: 'new-price', upgradePeriod: 'NEXT_PERIOD', useTrial: false, resetRecurrenceCount: false });
    agent.assertNoPendingInterceptors();
  });
  it('creates a one-off PRODUCT checkout for the difference, never a subscription checkout', async () => {
    let sent;
    pool.intercept({ path: '/payment/iyzipos/checkoutform/initialize/auth/ecom', method: 'POST' }).reply(200, (request) => {
      sent = JSON.parse(request.body); return { status: 'success', token: 'test-token', checkoutFormContent: '<p>payment</p>', tokenExpireTime: 1800 };
    });
    await provider.createPlanChangeCheckout({
      billingAccount: { contactFirstName: 'A', contactLastName: 'B', taxId: '11111111111', address: {} }, tenant: { _id: 'tenant-1' },
      change: { _id: 'change-1', amountMinor: 50000, currency: 'TRY', conversationId: 'ctx_upgrade_1', fromPlanName: 'Pro', toPlanName: 'Pro Max' },
      customerIp: '192.0.2.1',
    });
    expect(sent).toMatchObject({ price: 500, paidPrice: 500, paymentGroup: 'PRODUCT', enabledInstallments: [1], basketId: 'ctx_upgrade_1', conversationId: 'ctx_upgrade_1' });
    expect(sent).not.toHaveProperty('pricingPlanReferenceCode');
    expect(sent.basketItems[0].price).toBe(500);
    agent.assertNoPendingInterceptors();
  });
});

describe('cancellation of a scheduled upgrade', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  it('checks/cancels both references and skips already terminal references on retry', async () => {
    vi.stubEnv('BILLING_ENABLED_PROVIDERS', 'iyzico');
    const subscription = { _id: 'sub', tenantId: 'tenant', provider: 'iyzico', status: 'active', planChangeId: 'change',
      externalSubscriptionId: 'new', previousExternalSubscriptionId: 'old', save: vi.fn(async () => {}) };
    vi.spyOn(BillingSubscription, 'findOne').mockResolvedValue(subscription);
    vi.spyOn(BillingPlanChange, 'exists').mockResolvedValue(null);
    const states = { new: 'PENDING', old: 'ACTIVE' };
    vi.spyOn(provider, 'retrieveSubscription').mockImplementation(async (reference) => ({ data: { referenceCode: reference, subscriptionStatus: states[reference] } }));
    const cancel = vi.spyOn(provider, 'cancelSubscription').mockImplementation(async ({ externalSubscriptionId }) => {
      if (externalSubscriptionId === 'old' && states.new === 'CANCELED' && states.old === 'ACTIVE') { states.old = 'UNPAID'; throw new Error('uncertain response'); }
      states[externalSubscriptionId] = 'CANCELED'; return { status: 'canceled' };
    });
    expect((await requestTenantCancellation('tenant')).status).toBe('pending');
    expect((await requestTenantCancellation('tenant')).status).toBe('canceled');
    expect(cancel.mock.calls.filter(([input]) => input.externalSubscriptionId === 'new')).toHaveLength(1);
    expect(states.old).toBe('CANCELED');
  });
});
