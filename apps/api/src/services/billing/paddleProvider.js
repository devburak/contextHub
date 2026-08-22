const crypto = require('crypto');
const { fetch } = require('undici');

function getBaseUrl() {
  return String(process.env.PADDLE_ENV || 'sandbox').toLowerCase() === 'live'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com';
}

async function paddleRequest(pathname, { method = 'GET', body } = {}) {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error('PADDLE_API_KEY is not configured');

  const response = await fetch(`${getBaseUrl()}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.detail || payload?.error?.code || `Paddle request failed (${response.status})`);
    error.statusCode = response.status;
    error.providerPayload = payload?.error || null;
    throw error;
  }
  return payload.data;
}

function parseSignatureHeader(signatureHeader = '') {
  const values = {};
  for (const part of String(signatureHeader).split(';')) {
    const [key, value] = part.trim().split('=', 2);
    if (!key || !value) continue;
    if (!values[key]) values[key] = [];
    values[key].push(value);
  }
  return { timestamp: values.ts?.[0] || null, signatures: values.h1 || [] };
}

function verifyWebhook(rawBody, signatureHeader, options = {}) {
  const secret = options.secret || process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) throw new Error('PADDLE_WEBHOOK_SECRET is not configured');
  const raw = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody || '');
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || signatures.length === 0) throw new Error('Paddle signature header is invalid');

  const toleranceSeconds = Number(options.toleranceSeconds ?? process.env.PADDLE_WEBHOOK_TOLERANCE_SECONDS ?? 5);
  const nowSeconds = Number(options.nowSeconds ?? Math.floor(Date.now() / 1000));
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(nowSeconds - timestampNumber) > toleranceSeconds) {
    throw new Error('Paddle webhook timestamp is outside the allowed tolerance');
  }

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}:${raw}`, 'utf8').digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const valid = signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const candidate = Buffer.from(signature, 'hex');
    return candidate.length === expectedBuffer.length && crypto.timingSafeEqual(candidate, expectedBuffer);
  });
  if (!valid) throw new Error('Paddle webhook signature mismatch');

  return JSON.parse(raw);
}

async function createCheckout({ tenant, account, planPrice }) {
  if (!planPrice.externalPriceId) {
    throw new Error(`Paddle price is not configured for ${planPrice.key}`);
  }
  const checkoutUrl = process.env.PADDLE_CHECKOUT_BASE_URL || null;
  const transaction = await paddleRequest('/transactions', {
    method: 'POST',
    body: {
      items: [{ price_id: planPrice.externalPriceId, quantity: 1 }],
      collection_mode: 'automatic',
      custom_data: {
        account_id: String(account._id),
        tenant_id: String(tenant._id),
        plan_price_id: String(planPrice._id),
      },
      checkout: { url: checkoutUrl },
    },
  });
  return { provider: 'paddle', transactionId: transaction.id, checkoutUrl: transaction.checkout?.url || null };
}

async function createPortalSession({ externalCustomerId, externalSubscriptionId }) {
  if (!externalCustomerId) throw new Error('Paddle customer is not available yet');
  const body = externalSubscriptionId ? { subscription_ids: [externalSubscriptionId] } : {};
  const session = await paddleRequest(`/customers/${encodeURIComponent(externalCustomerId)}/portal-sessions`, {
    method: 'POST',
    body,
  });
  return {
    provider: 'paddle',
    portalUrl: session.urls?.general?.overview || null,
    cancelUrl: session.urls?.subscriptions?.[0]?.cancel_subscription || null,
    paymentMethodUrl: session.urls?.subscriptions?.[0]?.update_subscription_payment_method || null,
  };
}

module.exports = {
  createCheckout,
  createPortalSession,
  getBaseUrl,
  parseSignatureHeader,
  verifyWebhook,
};
