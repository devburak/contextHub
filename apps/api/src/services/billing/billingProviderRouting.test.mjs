import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  paymentMethodsForCountry,
  resolveBillingProvider,
  validateBillingProfile,
} = require('./billingRouting');
const {
  completeIyzicoReviewCheckout,
  serializeBillingAccount,
  serializeCatalogPlan,
} = require('./billingService');
const {
  generateAuthorizationHeader,
  reviewCheckoutRequestBody,
  checkoutFormSignaturePayload,
  verifyReviewCheckoutResponse,
  verifySubscriptionWebhook,
} = require('./iyzicoProvider');
const {
  BillingAccount,
  BillingCheckoutSession,
  BillingInvoice,
  Tenant,
} = require('@contexthub/common');
const tenantSubscriptionService = require('../tenantSubscriptionService');
const {
  getEnabledBillingProviders,
  isBillingProviderEnabled,
  isIyzicoReviewCheckoutFallbackEnabled,
} = require('../../lib/billingConfig');
const { decryptBillingPii, encryptBillingPii } = require('./billingPiiCrypto');

const originalEnabledProviders = process.env.BILLING_ENABLED_PROVIDERS;
const originalProvider = process.env.BILLING_PROVIDER;
const originalIyzicoReviewTenantIds = process.env.IYZICO_REVIEW_TENANT_IDS;
const originalIyzicoReviewUserEmails = process.env.IYZICO_REVIEW_USER_EMAILS;
const originalIyzicoReviewCheckoutFallback = process.env.IYZICO_REVIEW_CHECKOUT_FALLBACK;
const originalIyzicoEnvironment = process.env.IYZICO_ENV;
const originalIyzicoCallbackUrl = process.env.IYZICO_CALLBACK_URL;
const originalIyzicoSecretKey = process.env.IYZICO_SECRET_KEY;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalEnabledProviders === undefined) delete process.env.BILLING_ENABLED_PROVIDERS;
  else process.env.BILLING_ENABLED_PROVIDERS = originalEnabledProviders;
  if (originalProvider === undefined) delete process.env.BILLING_PROVIDER;
  else process.env.BILLING_PROVIDER = originalProvider;
  if (originalIyzicoReviewTenantIds === undefined) delete process.env.IYZICO_REVIEW_TENANT_IDS;
  else process.env.IYZICO_REVIEW_TENANT_IDS = originalIyzicoReviewTenantIds;
  if (originalIyzicoReviewUserEmails === undefined) delete process.env.IYZICO_REVIEW_USER_EMAILS;
  else process.env.IYZICO_REVIEW_USER_EMAILS = originalIyzicoReviewUserEmails;
  if (originalIyzicoReviewCheckoutFallback === undefined) delete process.env.IYZICO_REVIEW_CHECKOUT_FALLBACK;
  else process.env.IYZICO_REVIEW_CHECKOUT_FALLBACK = originalIyzicoReviewCheckoutFallback;
  if (originalIyzicoEnvironment === undefined) delete process.env.IYZICO_ENV;
  else process.env.IYZICO_ENV = originalIyzicoEnvironment;
  if (originalIyzicoCallbackUrl === undefined) delete process.env.IYZICO_CALLBACK_URL;
  else process.env.IYZICO_CALLBACK_URL = originalIyzicoCallbackUrl;
  if (originalIyzicoSecretKey === undefined) delete process.env.IYZICO_SECRET_KEY;
  else process.env.IYZICO_SECRET_KEY = originalIyzicoSecretKey;
});

describe('billing country routing', () => {
  it('routes Turkey to iyzico and never falls back to Paddle', () => {
    expect(resolveBillingProvider('tr')).toBe('iyzico');
    expect(resolveBillingProvider('US')).toBe('paddle');
  });

  it('requires Turkish invoice declarations before exposing checkout', () => {
    const result = validateBillingProfile({
      profileType: 'business',
      billingEmail: 'finance@example.test',
      legalName: 'Example A.Ş.',
      contactFirstName: 'Ada',
      contactLastName: 'Yılmaz',
      phone: '+905551112233',
      country: 'TR',
      taxId: '1234567890',
      taxOffice: 'Kadıköy',
      address: { line1: 'Örnek Sokak 1', city: 'İstanbul', postalCode: '34710' },
      declarationAcceptedAt: new Date(),
    });

    expect(result).toEqual({ complete: true, missingFields: [], errors: {} });
    expect(paymentMethodsForCountry('TR')).toEqual([
      expect.objectContaining({ key: 'credit_card' }),
    ]);
  });

  it('returns stable validation codes for invalid billing contact fields', () => {
    const result = validateBillingProfile({
      profileType: 'business',
      billingEmail: 'broken@',
      legalName: 'Example A.Ş.',
      contactFirstName: 'Ada',
      contactLastName: 'Yılmaz',
      phone: '123',
      country: 'TR',
      taxId: '1234567890',
      taxOffice: 'Kadıköy',
      address: { line1: 'Örnek Sokak 1', city: 'İstanbul', postalCode: '34A10' },
      declarationAcceptedAt: new Date(),
    });

    expect(result.errors).toEqual({
      billingEmail: 'invalid_email',
      phone: 'invalid_phone',
      'address.postalCode': 'invalid_postal_code_tr',
    });
  });

  it('keeps tax identifiers and provider selection out of owner-visible data', () => {
    const serialized = serializeBillingAccount({
      provider: 'iyzico',
      externalCustomerId: 'customer-secret',
      status: 'active',
      billingEmail: 'finance@example.test',
      legalName: 'Example A.Ş.',
      profileType: 'business',
      contactFirstName: 'Ada',
      contactLastName: 'Yılmaz',
      phone: '+905551112233',
      country: 'TR',
      taxId: '1234567890',
      taxOffice: 'Kadıköy',
      currency: 'TRY',
      address: { line1: 'Örnek Sokak 1', city: 'İstanbul', postalCode: '34710' },
      declarationAcceptedAt: new Date(),
    });

    expect(serialized).not.toHaveProperty('provider');
    expect(serialized).not.toHaveProperty('taxId');
    expect(serialized).not.toHaveProperty('externalCustomerId');
    expect(serialized.taxIdMasked).toBe('******7890');
  });

  it('requires the current self-service agreement version but preserves Enterprise contracts', () => {
    const base = {
      billingEmail: 'finance@example.test',
      legalName: 'Example Ltd',
      profileType: 'business',
      contactFirstName: 'Ada',
      contactLastName: 'Lovelace',
      phone: '+16175550100',
      country: 'US',
      address: { line1: '1 Main St', city: 'Boston', postalCode: '02108' },
      declarationAcceptedAt: new Date(),
      serviceAgreementAcceptedAt: new Date(),
    };

    expect(serializeBillingAccount({
      ...base,
      serviceAgreementVersion: 'ctxhub-cloud-terms-v1',
      paymentMethodStatus: 'provider_verified',
    }).commercialReadiness.agreementAccepted).toBe(false);
    expect(serializeBillingAccount({
      ...base,
      serviceAgreementVersion: 'ctxhub-cloud-terms-v2',
      paymentMethodStatus: 'provider_verified',
    }).commercialReadiness.agreementAccepted).toBe(false);
    expect(serializeBillingAccount({
      ...base,
      serviceAgreementVersion: 'ctxhub-cloud-terms-v3',
      paymentMethodStatus: 'provider_verified',
    }).commercialReadiness.agreementAccepted).toBe(false);
    expect(serializeBillingAccount({
      ...base,
      serviceAgreementVersion: 'ctxhub-cloud-terms-v4',
      paymentMethodStatus: 'provider_verified',
    }).commercialReadiness.agreementAccepted).toBe(false);
    expect(serializeBillingAccount({
      ...base,
      serviceAgreementVersion: 'ctxhub-cloud-terms-v5',
      paymentMethodStatus: 'provider_verified',
    }).commercialReadiness.agreementAccepted).toBe(true);
    expect(serializeBillingAccount({
      ...base,
      serviceAgreementVersion: 'legacy-enterprise-contract-v1',
      paymentMethodStatus: 'enterprise_contract',
    }).commercialReadiness.agreementAccepted).toBe(true);
  });

  it('enables only explicitly configured providers', () => {
    process.env.BILLING_ENABLED_PROVIDERS = 'paddle, iyzico,invalid,paddle';
    expect(getEnabledBillingProviders()).toEqual(['paddle', 'iyzico']);
  });

  it('fails closed when the provider allow-list is absent', () => {
    delete process.env.BILLING_ENABLED_PROVIDERS;
    process.env.BILLING_PROVIDER = 'paddle';
    expect(getEnabledBillingProviders()).toEqual([]);
  });

  it('does not let the review allow-list disable normal provider operations', () => {
    process.env.BILLING_ENABLED_PROVIDERS = 'paddle,iyzico';
    process.env.IYZICO_REVIEW_TENANT_IDS = 'tenant-review, tenant-second,tenant-review';

    expect(isBillingProviderEnabled('iyzico')).toBe(true);
    expect(isBillingProviderEnabled('paddle')).toBe(true);
  });

  it('enables review checkout only for the sandbox tenant and authenticated user pair', () => {
    process.env.IYZICO_ENV = 'sandbox';
    process.env.IYZICO_REVIEW_CHECKOUT_FALLBACK = 'true';
    process.env.IYZICO_REVIEW_TENANT_IDS = 'tenant-review';
    process.env.IYZICO_REVIEW_USER_EMAILS = 'Review@Example.Test';

    expect(isIyzicoReviewCheckoutFallbackEnabled({
      tenantId: 'tenant-review',
      userEmail: 'review@example.test',
    })).toBe(true);
    expect(isIyzicoReviewCheckoutFallbackEnabled({
      tenantId: 'tenant-other',
      userEmail: 'review@example.test',
    })).toBe(false);
    expect(isIyzicoReviewCheckoutFallbackEnabled({
      tenantId: 'tenant-review',
      userEmail: 'other@example.test',
    })).toBe(false);
    process.env.IYZICO_ENV = 'live';
    expect(isIyzicoReviewCheckoutFallbackEnabled({
      tenantId: 'tenant-review',
      userEmail: 'review@example.test',
    })).toBe(false);
  });

  it('fails review checkout closed when either allow-list is absent', () => {
    process.env.IYZICO_ENV = 'sandbox';
    process.env.IYZICO_REVIEW_CHECKOUT_FALLBACK = 'true';
    process.env.IYZICO_REVIEW_TENANT_IDS = 'tenant-review';
    delete process.env.IYZICO_REVIEW_USER_EMAILS;
    expect(isIyzicoReviewCheckoutFallbackEnabled({
      tenantId: 'tenant-review',
      userEmail: 'review@example.test',
    })).toBe(false);
  });

  it('marks an allowlisted iyzico review price ready without a subscription plan reference', () => {
    const plan = { _id: 'plan-pro', slug: 'pro', name: 'Pro', price: 12 };
    const result = serializeCatalogPlan(plan, [{
      _id: 'price-pro',
      planId: plan,
      provider: 'iyzico',
      interval: 'month',
      currency: 'TRY',
      amountMinor: 49900,
      externalPriceId: null,
    }], {
      selectedProvider: 'iyzico',
      providerEnabled: true,
      reviewCheckoutFallback: true,
    });

    expect(result.prices[0]).toMatchObject({
      id: 'price-pro',
      amountMinor: 49900,
      checkoutReady: true,
      catalogOnly: false,
    });
  });

  it('stores only a hash of the hosted checkout token', () => {
    expect(BillingCheckoutSession.schema.path('tokenHash').options.select).toBe(false);
    expect(BillingCheckoutSession.schema.path('expiresAt')).toBeTruthy();
    expect(BillingCheckoutSession.schema.path('checkoutMode').enumValues).toContain('review_checkout');
    expect(BillingCheckoutSession.schema.path('actorUserId')).toBeTruthy();
    expect(BillingCheckoutSession.schema.path('expectedAmountMinor')).toBeTruthy();
    expect(BillingCheckoutSession.schema.path('expectedCurrency')).toBeTruthy();
    expect(BillingCheckoutSession.schema.path('verifiedAt')).toBeTruthy();
    expect(BillingAccount.schema.path('taxId').options.select).toBe(false);
    expect(BillingAccount.schema.path('taxIdEncrypted').options.select).toBe(false);
  });

  it('encrypts billing tax identifiers with authenticated encryption', () => {
    const key = '11'.repeat(32);
    const encrypted = encryptBillingPii('1234567890', key);

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('1234567890');
    expect(decryptBillingPii(encrypted, key)).toBe('1234567890');
    expect(() => decryptBillingPii(encrypted, '22'.repeat(32))).toThrow();
  });
});

describe('iyzico signed subscription webhook', () => {
  it('builds deterministic IYZWSv2 request authentication', () => {
    const body = { locale: 'tr', conversationId: 'ctx-1' };
    const header = generateAuthorizationHeader('/v2/subscription/checkoutform/initialize', body, {
      apiKey: 'api-key',
      secretKey: 'secret-key',
      randomKey: 'random-key',
    });
    const decoded = Buffer.from(header.authorization.replace('IYZWSv2 ', ''), 'base64').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', 'secret-key')
      .update(`random-key/v2/subscription/checkoutform/initialize${JSON.stringify(body)}`)
      .digest('hex');

    expect(decoded).toBe(`apiKey:api-key&randomKey:random-key&signature:${expectedSignature}`);
  });

  it('does not append an empty JSON body to GET request signatures', () => {
    const header = generateAuthorizationHeader('/v2/subscription/products', undefined, {
      apiKey: 'api-key',
      secretKey: 'secret-key',
      randomKey: 'random-key',
    });
    const decoded = Buffer.from(header.authorization.replace('IYZWSv2 ', ''), 'base64').toString('utf8');
    const expectedSignature = crypto.createHmac('sha256', 'secret-key')
      .update('random-key/v2/subscription/products')
      .digest('hex');

    expect(decoded).toBe(`apiKey:api-key&randomKey:random-key&signature:${expectedSignature}`);
  });

  it('builds a single-installment virtual basket for the sandbox review checkout', () => {
    process.env.IYZICO_CALLBACK_URL = 'https://api.example.test/api/billing/callbacks/iyzico';
    const body = reviewCheckoutRequestBody({
      billingAccount: {
        contactFirstName: 'Test',
        contactLastName: 'User',
        billingEmail: 'review@example.test',
        phone: '+905301112233',
        taxId: '11111111111',
        address: { line1: 'Test Street 1', city: 'Istanbul', postalCode: '34000' },
      },
      tenant: { _id: 'tenant-review', name: 'Review Tenant' },
      planPrice: {
        key: 'pro.iyzico.month.try',
        interval: 'month',
        currency: 'TRY',
        amountMinor: 49900,
        planId: { name: 'Pro' },
      },
      customerIp: '203.0.113.5',
    });

    expect(body).toMatchObject({
      price: 499,
      paidPrice: 499,
      currency: 'TRY',
      paymentGroup: 'SUBSCRIPTION',
      enabledInstallments: [1],
      callbackUrl: 'https://api.example.test/api/billing/callbacks/iyzico',
      buyer: { ip: '203.0.113.5' },
      basketItems: [{ id: 'pro.iyzico.month.try', itemType: 'VIRTUAL', price: 499 }],
    });
  });

  it('verifies the documented checkout-form response signature and identifiers', () => {
    const result = {
      paymentStatus: 'SUCCESS',
      paymentId: 'payment-1',
      currency: 'TRY',
      basketId: 'conversation-1',
      conversationId: 'conversation-1',
      paidPrice: '499.00',
      price: '499.0',
      token: 'checkout-token',
    };
    result.signature = crypto.createHmac('sha256', 'test-secret')
      .update(checkoutFormSignaturePayload(result))
      .digest('hex');

    expect(verifyReviewCheckoutResponse(result, {
      checkoutToken: 'checkout-token',
      conversationId: 'conversation-1',
      secretKey: 'test-secret',
    })).toBe(result);
    expect(() => verifyReviewCheckoutResponse({ ...result, basketId: 'other' }, {
      checkoutToken: 'checkout-token',
      conversationId: 'conversation-1',
      secretKey: 'test-secret',
    })).toThrow(/conversation mismatch/);
    expect(() => verifyReviewCheckoutResponse({ ...result, signature: '0'.repeat(64) }, {
      checkoutToken: 'checkout-token',
      conversationId: 'conversation-1',
      secretKey: 'test-secret',
    })).toThrow(/signature mismatch/);
  });

  it('records a verified review proof without creating entitlement, subscription, or invoice state', async () => {
    process.env.IYZICO_SECRET_KEY = 'test-secret';
    const result = {
      status: 'success',
      paymentStatus: 'SUCCESS',
      paymentId: 'payment-review-1',
      currency: 'TRY',
      basketId: 'conversation-review-1',
      conversationId: 'conversation-review-1',
      paidPrice: '499.00',
      price: '499.0',
      token: 'checkout-token',
    };
    result.signature = crypto.createHmac('sha256', 'test-secret')
      .update(checkoutFormSignaturePayload(result))
      .digest('hex');

    const save = vi.fn().mockResolvedValue(undefined);
    const session = {
      conversationId: 'conversation-review-1',
      tenantId: 'tenant-review',
      expectedAmountMinor: 49900,
      expectedCurrency: 'TRY',
      save,
    };
    vi.spyOn(require('./iyzicoProvider'), 'retrieveReviewCheckout').mockResolvedValue(result);
    vi.spyOn(Tenant, 'findById').mockReturnValue({ select: vi.fn().mockResolvedValue({ status: 'active' }) });
    const invoiceWrite = vi.spyOn(BillingInvoice, 'findOneAndUpdate');
    const billingAccountWrite = vi.spyOn(BillingAccount, 'findOneAndUpdate');
    const applyPlan = vi.spyOn(tenantSubscriptionService, 'applyPlanToTenant');

    await expect(completeIyzicoReviewCheckout(session, 'checkout-token')).resolves.toMatchObject({
      completed: true,
      reviewCheckout: true,
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(session).toMatchObject({
      status: 'completed',
      externalTransactionId: 'payment-review-1',
      verifiedAmountMinor: 49900,
      verifiedCurrency: 'TRY',
    });
    expect(session.externalSubscriptionId).toBeUndefined();
    expect(invoiceWrite).not.toHaveBeenCalled();
    expect(billingAccountWrite).not.toHaveBeenCalled();
    expect(applyPlan).not.toHaveBeenCalled();
  });

  it('accepts the documented X-IYZ-SIGNATURE-V3 field order', () => {
    const payload = {
      iyziEventType: 'subscription.order.success',
      subscriptionReferenceCode: 'sub-1',
      orderReferenceCode: 'order-1',
      customerReferenceCode: 'customer-1',
    };
    const secretKey = 'test-secret';
    const merchantId = 'merchant-1';
    const message = `${merchantId}${secretKey}${payload.iyziEventType}${payload.subscriptionReferenceCode}${payload.orderReferenceCode}${payload.customerReferenceCode}`;
    const signature = crypto.createHmac('sha256', secretKey).update(message).digest('hex');

    expect(verifySubscriptionWebhook(payload, signature, { secretKey, merchantId })).toBe(payload);
    expect(() => verifySubscriptionWebhook(payload, '0'.repeat(64), { secretKey, merchantId })).toThrow(/mismatch/);
  });
});
