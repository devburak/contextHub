import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  paymentMethodsForCountry,
  resolveBillingProvider,
  validateBillingProfile,
} = require('./billingRouting');
const { serializeBillingAccount } = require('./billingService');
const { generateAuthorizationHeader, verifySubscriptionWebhook } = require('./iyzicoProvider');
const { BillingAccount, BillingCheckoutSession } = require('@contexthub/common');
const { getEnabledBillingProviders } = require('../../lib/billingConfig');
const { decryptBillingPii, encryptBillingPii } = require('./billingPiiCrypto');

const originalEnabledProviders = process.env.BILLING_ENABLED_PROVIDERS;
const originalProvider = process.env.BILLING_PROVIDER;

afterEach(() => {
  if (originalEnabledProviders === undefined) delete process.env.BILLING_ENABLED_PROVIDERS;
  else process.env.BILLING_ENABLED_PROVIDERS = originalEnabledProviders;
  if (originalProvider === undefined) delete process.env.BILLING_PROVIDER;
  else process.env.BILLING_PROVIDER = originalProvider;
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

  it('stores only a hash of the hosted checkout token', () => {
    expect(BillingCheckoutSession.schema.path('tokenHash').options.select).toBe(false);
    expect(BillingCheckoutSession.schema.path('expiresAt')).toBeTruthy();
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
