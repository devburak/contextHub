const crypto = require('crypto');
const { fetch } = require('undici');

function getBaseUrl() {
  return String(process.env.IYZICO_ENV || 'sandbox').toLowerCase() === 'live'
    ? 'https://api.iyzipay.com'
    : 'https://sandbox-api.iyzipay.com';
}

function generateAuthorizationHeader(pathname, body, options = {}) {
  const apiKey = options.apiKey || process.env.IYZICO_API_KEY;
  const secretKey = options.secretKey || process.env.IYZICO_SECRET_KEY;
  if (!apiKey || !secretKey) throw new Error('IYZICO_API_KEY and IYZICO_SECRET_KEY must be configured');
  const randomKey = options.randomKey || crypto.randomBytes(12).toString('hex');
  const serializedBody = body === undefined ? '' : JSON.stringify(body);
  const signature = crypto.createHmac('sha256', secretKey)
    .update(`${randomKey}${pathname}${serializedBody}`)
    .digest('hex');
  const encoded = Buffer.from(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`).toString('base64');
  return { authorization: `IYZWSv2 ${encoded}`, randomKey };
}

async function iyzicoRequest(pathname, { method = 'GET', body } = {}) {
  // iyzico's V2 signature payload uses the URI path without its query string.
  // The query remains on the actual request URL.
  const signaturePath = String(pathname).split('?')[0];
  const { authorization, randomKey } = generateAuthorizationHeader(signaturePath, body);
  const response = await fetch(`${getBaseUrl()}${pathname}`, {
    method,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      'x-iyzi-rnd': randomKey,
      'x-iyzi-client-version': 'contexthub-1',
    },
    body: method === 'GET' || body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || String(result.status || '').toLowerCase() !== 'success') {
    const providerError = new Error(result?.errorMessage || `iyzico request failed (${response.status})`);
    providerError.code = result?.errorCode || 'IyzicoRequestFailed';
    providerError.statusCode = response.status;
    providerError.providerPayload = result || null;
    throw providerError;
  }
  return result;
}

function reviewCheckoutRequestBody({ billingAccount, tenant, planPrice, customerIp }) {
  const contactName = `${billingAccount.contactFirstName} ${billingAccount.contactLastName}`.trim();
  const address = [billingAccount.address?.line1, billingAccount.address?.line2].filter(Boolean).join(' ');
  const conversationId = `ctx_review_cf_${tenant._id}_${Date.now()}`;
  const amount = Number((Number(planPrice.amountMinor || 0) / 100).toFixed(2));
  return {
    locale: 'tr',
    conversationId,
    price: amount,
    paidPrice: amount,
    currency: planPrice.currency,
    basketId: conversationId,
    paymentGroup: 'SUBSCRIPTION',
    callbackUrl: process.env.IYZICO_CALLBACK_URL,
    enabledInstallments: [1],
    buyer: {
      id: String(tenant._id),
      name: billingAccount.contactFirstName,
      surname: billingAccount.contactLastName,
      identityNumber: String(billingAccount.taxId || '').replace(/\D/g, ''),
      email: billingAccount.billingEmail,
      gsmNumber: billingAccount.phone,
      registrationAddress: address,
      city: billingAccount.address?.city,
      country: 'Turkey',
      zipCode: billingAccount.address?.postalCode,
      ip: customerIp || process.env.IYZICO_MERCHANT_IP || '127.0.0.1',
    },
    billingAddress: {
      contactName,
      city: billingAccount.address?.city,
      country: 'Turkey',
      address,
      zipCode: billingAccount.address?.postalCode,
    },
    basketItems: [{
      id: planPrice.key,
      name: `${planPrice.planId?.name || tenant.name} ${planPrice.interval === 'year' ? 'Yıllık' : 'Aylık'}`,
      category1: 'Software',
      itemType: 'VIRTUAL',
      price: amount,
    }],
  };
}

async function createReviewCheckout({ billingAccount, tenant, planPrice, customerIp }) {
  if (!process.env.IYZICO_CALLBACK_URL) throw new Error('IYZICO_CALLBACK_URL is not configured');
  const body = reviewCheckoutRequestBody({ billingAccount, tenant, planPrice, customerIp });
  const result = await iyzicoRequest('/payment/iyzipos/checkoutform/initialize/auth/ecom', {
    method: 'POST',
    body,
  });
  return {
    provider: 'iyzico',
    checkoutMode: 'review_checkout',
    transactionId: result.token,
    conversationId: body.conversationId,
    checkoutToken: result.token,
    checkoutUrl: result.paymentPageUrl,
    checkoutContent: result.checkoutFormContent,
    expiresInSeconds: Number(result.tokenExpireTime || 1800),
  };
}

async function retrieveReviewCheckout(checkoutToken, conversationId) {
  return iyzicoRequest('/payment/iyzipos/checkoutform/auth/ecom/detail', {
    method: 'POST',
    body: {
      locale: 'tr',
      conversationId,
      token: checkoutToken,
    },
  });
}

function checkoutFormSignaturePayload(result) {
  const numericFields = new Set(['paidPrice', 'price']);
  const fields = [
    'paymentStatus',
    'paymentId',
    'currency',
    'basketId',
    'conversationId',
    'paidPrice',
    'price',
    'token',
  ];
  return fields.map((field) => {
    const value = result?.[field];
    if (numericFields.has(field)) {
      const number = Number(value);
      if (!Number.isFinite(number)) return String(value ?? '');
      return String(number);
    }
    return String(value ?? '');
  }).join(':');
}

function verifyReviewCheckoutResponse(result, {
  checkoutToken,
  conversationId,
  secretKey = process.env.IYZICO_SECRET_KEY,
} = {}) {
  if (!secretKey) throw new Error('IYZICO_SECRET_KEY must be configured');
  if (String(result?.token || '') !== String(checkoutToken || '')) {
    throw new Error('iyzico checkout token mismatch');
  }
  if (
    String(result?.conversationId || '') !== String(conversationId || '')
    || String(result?.basketId || '') !== String(conversationId || '')
  ) {
    throw new Error('iyzico checkout conversation mismatch');
  }
  const signature = String(result?.signature || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(signature)) {
    throw new Error('iyzico checkout response signature is invalid');
  }
  const expected = crypto.createHmac('sha256', secretKey)
    .update(checkoutFormSignaturePayload(result))
    .digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(signature, 'hex');
  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error('iyzico checkout response signature mismatch');
  }
  return result;
}

function customerFromBillingAccount(billingAccount) {
  const contactName = `${billingAccount.contactFirstName} ${billingAccount.contactLastName}`.trim();
  return {
    name: billingAccount.contactFirstName,
    surname: billingAccount.contactLastName,
    email: billingAccount.billingEmail,
    gsmNumber: billingAccount.phone,
    identityNumber: String(billingAccount.taxId || '').replace(/\D/g, ''),
    billingAddress: {
      contactName,
      city: billingAccount.address?.city,
      district: billingAccount.address?.district || billingAccount.address?.region || '',
      country: 'Turkey',
      address: [billingAccount.address?.line1, billingAccount.address?.line2].filter(Boolean).join(' '),
      zipCode: billingAccount.address?.postalCode,
    },
  };
}

async function createCheckout({ billingAccount, account, tenant, planPrice }) {
  if (!planPrice.externalPriceId) throw new Error(`iyzico plan is not configured for ${planPrice.key}`);
  const callbackUrl = process.env.IYZICO_CALLBACK_URL;
  if (!callbackUrl) throw new Error('IYZICO_CALLBACK_URL is not configured');
  const conversationId = `ctx_${account._id}_${tenant._id}_${Date.now()}`;
  const result = await iyzicoRequest('/v2/subscription/checkoutform/initialize', {
    method: 'POST',
    body: {
      locale: 'tr',
      conversationId,
      callbackUrl,
      pricingPlanReferenceCode: planPrice.externalPriceId,
      subscriptionInitialStatus: 'ACTIVE',
      customer: customerFromBillingAccount(billingAccount),
    },
  });

  return {
    provider: 'iyzico',
    checkoutMode: 'subscription',
    transactionId: result.token,
    conversationId,
    checkoutToken: result.token,
    checkoutContent: result.checkoutFormContent,
    expiresInSeconds: Number(result.tokenExpireTime || 1800),
  };
}

async function retrieveCheckout(checkoutToken) {
  return iyzicoRequest(`/v2/subscription/checkoutform/${encodeURIComponent(checkoutToken)}`);
}

async function createPortalSession({ externalSubscriptionId }) {
  if (!externalSubscriptionId) throw new Error('iyzico subscription is not available yet');
  const callbackUrl = process.env.IYZICO_CARD_UPDATE_CALLBACK_URL;
  if (!callbackUrl) throw new Error('IYZICO_CARD_UPDATE_CALLBACK_URL is not configured');
  const result = await iyzicoRequest('/v2/subscription/card-update/checkoutform/initialize/with-subscription', {
    method: 'POST',
    body: {
      locale: 'tr',
      conversationId: `ctx_card_${Date.now()}`,
      subscriptionReferenceCode: externalSubscriptionId,
      callbackUrl,
    },
  });
  return {
    provider: 'iyzico',
    paymentMethodContent: result.checkoutFormContent,
    expiresInSeconds: Number(result.tokenExpireTime || 1800),
  };
}

async function cancelSubscription({ externalSubscriptionId }) {
  if (!externalSubscriptionId) throw new Error('iyzico subscription is not available');
  await iyzicoRequest(
    `/v2/subscription/subscriptions/${encodeURIComponent(externalSubscriptionId)}/cancel`,
    {
      method: 'POST',
      body: { subscriptionReferenceCode: externalSubscriptionId },
    }
  );
  return {
    status: 'canceled',
    cancelAtPeriodEnd: false,
    canceledAt: new Date(),
    effectiveAt: new Date(),
  };
}

function verifySubscriptionWebhook(payload, signatureHeader, options = {}) {
  const secretKey = options.secretKey || process.env.IYZICO_SECRET_KEY;
  const merchantId = options.merchantId || process.env.IYZICO_MERCHANT_ID;
  if (!secretKey || !merchantId) throw new Error('iyzico webhook verification is not configured');
  if (!signatureHeader || !/^[a-f0-9]{64}$/i.test(String(signatureHeader))) {
    throw new Error('iyzico webhook signature is invalid');
  }
  const message = [
    merchantId,
    secretKey,
    payload?.iyziEventType,
    payload?.subscriptionReferenceCode,
    payload?.orderReferenceCode,
    payload?.customerReferenceCode,
  ].map((value) => String(value || '')).join('');
  const expected = crypto.createHmac('sha256', secretKey).update(message).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const signatureBuffer = Buffer.from(String(signatureHeader), 'hex');
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error('iyzico webhook signature mismatch');
  }
  return payload;
}

module.exports = {
  cancelSubscription,
  createCheckout,
  createReviewCheckout,
  createPortalSession,
  customerFromBillingAccount,
  generateAuthorizationHeader,
  getBaseUrl,
  checkoutFormSignaturePayload,
  iyzicoRequest,
  reviewCheckoutRequestBody,
  retrieveCheckout,
  retrieveReviewCheckout,
  verifyReviewCheckoutResponse,
  verifySubscriptionWebhook,
};
