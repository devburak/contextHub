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
  const requestBody = body === undefined ? {} : body;
  const signature = crypto.createHmac('sha256', secretKey)
    .update(`${randomKey}${pathname}${JSON.stringify(requestBody)}`)
    .digest('hex');
  const encoded = Buffer.from(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`).toString('base64');
  return { authorization: `IYZWSv2 ${encoded}`, randomKey };
}

async function iyzicoRequest(pathname, { method = 'GET', body } = {}) {
  const requestBody = body === undefined ? {} : body;
  const { authorization, randomKey } = generateAuthorizationHeader(pathname, requestBody);
  const response = await fetch(`${getBaseUrl()}${pathname}`, {
    method,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
      'x-iyzi-rnd': randomKey,
      'x-iyzi-client-version': 'contexthub-1',
    },
    body: method === 'GET' ? undefined : JSON.stringify(requestBody),
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
  createCheckout,
  createPortalSession,
  customerFromBillingAccount,
  generateAuthorizationHeader,
  getBaseUrl,
  retrieveCheckout,
  verifySubscriptionWebhook,
};
