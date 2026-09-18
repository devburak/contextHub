const crypto = require('crypto');
const {
  Account,
  BillingAccount,
  BillingPlanChange,
  BillingEvent,
  BillingInvoice,
  BillingSubscription,
  PlanPrice,
  SubscriptionPlan,
  Tenant,
  User,
} = require('@contexthub/common');
const tenantSubscriptionService = require('../tenantSubscriptionService');
const billingCancellationService = require('./billingCancellationService');
const paddleProvider = require('./paddleProvider');
const iyzicoProvider = require('./iyzicoProvider');
const { encryptBillingPii, decryptBillingPii } = require('./billingPiiCrypto');
const { recipientAddress, sendCustomerPaymentNotification } = require('./customerPaymentNotificationService');
const {
  hostedOperationsNotificationService,
  isEnabled: hostedOperationsNotificationsEnabled,
} = require('../hostedOperationsNotificationService');

const SUBSCRIPTION_EVENTS = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.activated',
  'subscription.resumed',
  'subscription.paused',
  'subscription.canceled',
  'subscription.past_due',
]);

function asDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function asMinor(value) {
  const parsed = Number.parseInt(value ?? 0, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeStatus(value, fallback = 'pending') {
  const status = String(value || '').toLowerCase();
  if (['trialing', 'active', 'past_due', 'paused', 'canceled'].includes(status)) return status;
  return fallback;
}

function extractPriceId(data) {
  return data?.items?.[0]?.price?.id || data?.items?.[0]?.price_id || null;
}

function billingEventPayloadRetentionDays() {
  const configured = Number.parseInt(process.env.BILLING_EVENT_PAYLOAD_RETENTION_DAYS || '30', 10);
  return Number.isFinite(configured) ? Math.max(1, Math.min(365, configured)) : 30;
}

function payloadExpiresAt(now = new Date()) {
  return new Date(now.getTime() + billingEventPayloadRetentionDays() * 86400000);
}

function compactObject(value) {
  if (Array.isArray(value)) return value.map(compactObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null)
    .map(([key, item]) => [key, compactObject(item)]));
}

async function notifySuccessfulPayment({
  tenant,
  subscription,
  amountMinor,
  currency,
  occurredAt,
}) {
  if (!hostedOperationsNotificationsEnabled()) return { sent: false, disabled: true };
  const [owner, plan, billingAccount] = await Promise.all([
    tenant.createdBy ? User.findById(tenant.createdBy).select('email').lean() : null,
    subscription?.planId ? SubscriptionPlan.findById(subscription.planId).select('slug name').lean() : null,
    BillingAccount.findOne({ accountId: tenant.accountId }).select('billingEmail').lean(),
  ]);
  return hostedOperationsNotificationService.notifyPaymentReceived({
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    ownerEmail: owner?.email || billingAccount?.billingEmail || '',
    plan: plan?.slug || plan?.name || tenant.plan || 'unknown',
    amountMinor,
    currency,
    occurredAt,
  });
}

// Internal jobs share the existing durable event queue, but are never accepted
// from the public webhook endpoint. Provider order IDs deduplicate delivery
// between checkout reconciliation and the signed webhook (including retries).
async function queueInternalIyzicoEvent({ eventId, eventType, subscription, payload, occurredAt = new Date() }) {
  try {
    return await BillingEvent.create({
      provider: 'iyzico', eventId, eventType, occurredAt,
      tenantId: subscription.tenantId, accountId: subscription.accountId,
      externalSubscriptionId: subscription.externalSubscriptionId,
      payload, payloadHash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
      payloadExpiresAt: payloadExpiresAt(),
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    return BillingEvent.findOne({ provider: 'iyzico', eventId });
  }
}

async function queueIyzicoCheckoutReconciliation(subscription) {
  return queueInternalIyzicoEvent({
    eventId: `checkout-reconciliation:${subscription.externalSubscriptionId}`,
    eventType: 'internal.iyzico.checkout.reconcile',
    subscription,
    payload: { source: 'verified_checkout' },
  });
}

async function queueIyzicoPaymentNotification(subscription, orderReferenceCode, { amountMinor, currency, occurredAt }) {
  if (!orderReferenceCode) throw new Error('iyzico payment order reference is missing');
  const notification = await queueInternalIyzicoEvent({
    eventId: `payment-notification:${orderReferenceCode}`,
    eventType: 'internal.iyzico.payment.notify',
    subscription, occurredAt,
    payload: { orderReferenceCode, amountMinor, currency },
  });
  await processEvent(notification._id);
}

async function queueCustomerPaymentNotification(event, subscription, tenant) {
  if (process.env.BILLING_CUSTOMER_NOTIFICATIONS_ENABLED !== 'true') {
    throw new Error('Customer payment notifications are disabled');
  }
  if (event.provider !== 'iyzico' || event.eventType !== 'internal.iyzico.payment.notify'
      || !['processing', 'processed', 'failed'].includes(event.status)
      || !event.payload?.orderReferenceCode
      || String(event.tenantId) !== String(tenant._id)
      || String(event.accountId) !== String(tenant.accountId)
      || String(subscription.accountId) !== String(event.accountId)
      || String(subscription.tenantId) !== String(event.tenantId)
      || subscription.externalSubscriptionId !== event.externalSubscriptionId) {
    throw new Error('Customer notification requires a verified, scoped payment event');
  }
  const eventId = `customer-payment-notification:${event.payload.orderReferenceCode}`;
  const existing = await BillingEvent.findOne({ provider: 'iyzico', eventId });
  if (existing) return existing;
  const [account, plan] = await Promise.all([
    BillingAccount.findOne({ accountId: event.accountId }).select('billingEmail').lean(),
    subscription.planId ? SubscriptionPlan.findById(subscription.planId).select('slug name').lean() : null,
  ]);
  const billingEmail = recipientAddress(account?.billingEmail);
  const names = { pro: 'Pro', promax: 'Pro Max', enterprise: 'Enterprise' };
  return queueInternalIyzicoEvent({
    eventId, eventType: 'internal.iyzico.payment.customer.notify', subscription, occurredAt: event.occurredAt,
    payload: compactObject({
      // Snapshot the intended recipient so a later billing-profile edit cannot
      // redirect a queued receipt. Plaintext email is never stored in the event.
      recipientEncrypted: encryptBillingPii(billingEmail),
      tenantName: tenant.name,
      planName: event.payload.planName || plan?.name || names[plan?.slug] || plan?.slug || tenant.plan,
      interval: event.payload.interval || subscription.interval,
      paymentKind: event.payload.paymentKind || 'subscription',
      amountMinor: event.payload.amountMinor, currency: event.payload.currency,
      recurringAmountMinor: event.payload.recurringAmountMinor,
      nextBillingAt: asDate(event.payload.nextBillingAt)?.toISOString(),
    }),
  });
}

async function processCustomerPaymentNotification(event) {
  // This internal job can only be created from a verified payment; neither an
  // untrusted webhook nor the browser can select recipients or claim payment.
  if (!event.payload?.notificationSentAt) {
    const delivery = await sendCustomerPaymentNotification({
      ...event.payload, occurredAt: event.occurredAt,
      billingEmail: decryptBillingPii(event.payload?.recipientEncrypted),
    });
    event.payload = { ...event.payload, notificationSentAt: new Date().toISOString(), messageId: delivery.messageId };
  }
  event.status = 'processed';
  event.processedAt = new Date();
  event.lastError = '';
  await event.save();
  return event;
}

async function processInternalIyzicoEvent(event) {
  let subscription = await BillingSubscription.findOne({
    provider: 'iyzico', externalSubscriptionId: event.externalSubscriptionId,
    tenantId: event.tenantId,
  });
  if (!subscription) {
    const replacement = await BillingSubscription.findOne({
      provider: 'iyzico', previousExternalSubscriptionId: event.externalSubscriptionId, tenantId: event.tenantId,
    });
    const change = replacement?.planChangeId ? await BillingPlanChange.findById(replacement.planChangeId) : null;
    if (change?.externalSubscriptionId === event.externalSubscriptionId) {
      const oldPrice = await PlanPrice.findById(change.fromPriceId);
      if (oldPrice) subscription = {
        ...replacement.toObject(), externalSubscriptionId: event.externalSubscriptionId,
        planId: oldPrice.planId, planPriceId: oldPrice._id, amountMinor: change.currentAmountMinor,
      };
    }
  }
  if (!subscription) throw new Error('iyzico subscription is not ready for reconciliation');
  if (event.eventType === 'internal.iyzico.checkout.reconcile') {
    const result = await iyzicoProvider.retrieveSubscription(subscription.externalSubscriptionId);
    const data = result.data;
    const price = await PlanPrice.findById(subscription.planPriceId);
    if (data?.referenceCode !== subscription.externalSubscriptionId
        || !price?.externalPriceId || data.pricingPlanReferenceCode !== price.externalPriceId) {
      throw new Error('iyzico reconciliation subscription or plan mismatch');
    }
    const orders = (data.orders || []).filter((order) => order.orderStatus === 'SUCCESS');
    if (orders.length === 0) throw new Error('iyzico successful payment is not available yet');
    for (const order of orders) {
      const amountMinor = Math.round(Number(order.price) * 100);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || order.currencyCode !== subscription.currency) {
        throw new Error('iyzico reconciliation payment amount or currency is invalid');
      }
      const paidAttempt = order.paymentAttempts?.find((attempt) => attempt.paymentStatus === 'SUCCESS');
      const occurredAt = asDate(paidAttempt?.createdDate) || asDate(order.startPeriod);
      if (!occurredAt) throw new Error('iyzico reconciliation payment date is invalid');
      await queueIyzicoPaymentNotification(subscription, order.referenceCode, {
        amountMinor, currency: order.currencyCode, occurredAt,
      });
    }
  } else {
    const tenant = await Tenant.findById(subscription.tenantId);
    if (!tenant) throw new Error('iyzico notification tenant was not found');
    let customerJobCreated = false;
    const [operations, customer] = await Promise.allSettled([
      event.payload.notificationSentAt ? { sent: false } : notifySuccessfulPayment({
        tenant, subscription,
        amountMinor: event.payload.amountMinor, currency: event.payload.currency, occurredAt: event.occurredAt,
      }),
      (async () => {
        if (process.env.BILLING_CUSTOMER_NOTIFICATIONS_ENABLED !== 'true') return;
        const customerJob = await queueCustomerPaymentNotification(event, subscription, tenant);
        customerJobCreated = true;
        return processEvent(customerJob._id);
      })(),
    ]);
    // Each recipient has its own durable state. A customer SMTP failure never
    // resends the operations email or makes a verified payment appear failed.
    if (customer.status === 'rejected') console.error('[Billing] Customer payment notification queued for retry');
    if (operations.status === 'rejected') throw operations.reason;
    const delivery = operations.value;
    if (delivery?.sent) {
      event.payload = { ...event.payload, notificationSentAt: new Date().toISOString(), messageId: delivery.messageId };
      // Persist delivery before other reconciliation work so later failures do
      // not send the same notification again on a normal retry.
    }
    if (customer.status === 'rejected' && !customerJobCreated) {
      // Retain the operations acknowledgement before retrying a queue/profile
      // failure; retry must not resend the already-accepted operations email.
      await event.save();
      throw new Error('Customer payment notification could not be queued');
    }
  }
  event.status = 'processed';
  event.processedAt = new Date();
  event.lastError = '';
  await event.save();
  return event;
}

function minimizePaddlePayload(payload) {
  const data = payload?.data || {};
  return compactObject({
    event_id: payload?.event_id,
    event_type: payload?.event_type,
    occurred_at: payload?.occurred_at,
    data: {
      id: data.id,
      customer_id: data.customer_id,
      subscription_id: data.subscription_id,
      status: data.status,
      currency_code: data.currency_code,
      invoice_number: data.invoice_number,
      billed_at: data.billed_at,
      next_billed_at: data.next_billed_at,
      canceled_at: data.canceled_at,
      custom_data: {
        account_id: data.custom_data?.account_id || data.custom_data?.accountId,
        tenant_id: data.custom_data?.tenant_id || data.custom_data?.tenantId,
        plan_price_id: data.custom_data?.plan_price_id || data.custom_data?.planPriceId,
      },
      items: Array.isArray(data.items) ? data.items.slice(0, 20).map((item) => ({
        price_id: item?.price_id,
        price: { id: item?.price?.id },
      })) : undefined,
      current_billing_period: {
        starts_at: data.current_billing_period?.starts_at,
        ends_at: data.current_billing_period?.ends_at,
      },
      billing_period: {
        starts_at: data.billing_period?.starts_at,
        ends_at: data.billing_period?.ends_at,
      },
      scheduled_change: { action: data.scheduled_change?.action },
      details: {
        totals: {
          subtotal: data.details?.totals?.subtotal,
          tax: data.details?.totals?.tax,
          total: data.details?.totals?.total,
        },
      },
      payments: Array.isArray(data.payments) ? data.payments.slice(0, 20).map((payment) => ({
        captured_at: payment?.captured_at,
      })) : undefined,
    },
  });
}

function minimizeIyzicoPayload(payload) {
  return compactObject({
    iyziReferenceCode: payload?.iyziReferenceCode,
    iyziEventType: payload?.iyziEventType,
    iyziEventTime: payload?.iyziEventTime,
    customerReferenceCode: payload?.customerReferenceCode,
    subscriptionReferenceCode: payload?.subscriptionReferenceCode,
    orderReferenceCode: payload?.orderReferenceCode,
  });
}

async function acceptPaddleEvent(rawBody, signatureHeader) {
  const payload = paddleProvider.verifyWebhook(rawBody, signatureHeader);
  if (!payload?.event_id || !payload?.event_type || !asDate(payload?.occurred_at)) {
    const error = new Error('Paddle event envelope is incomplete');
    error.code = 'InvalidWebhookEnvelope';
    throw error;
  }

  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''));
  try {
    const event = await BillingEvent.create({
      provider: 'paddle',
      eventId: payload.event_id,
      eventType: payload.event_type,
      occurredAt: asDate(payload.occurred_at),
      tenantId: payload.data?.custom_data?.tenant_id || null,
      externalCustomerId: payload.data?.customer_id || null,
      externalSubscriptionId: payload.data?.subscription_id || payload.data?.id || null,
      payloadHash: crypto.createHash('sha256').update(raw).digest('hex'),
      payload: minimizePaddlePayload(payload),
      payloadExpiresAt: payloadExpiresAt(),
    });
    return { event, duplicate: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const event = await BillingEvent.findOne({ provider: 'paddle', eventId: payload.event_id });
    return { event, duplicate: true };
  }
}

async function acceptIyzicoEvent(payload, signatureHeader) {
  iyzicoProvider.verifySubscriptionWebhook(payload, signatureHeader);
  if (!['subscription.order.success', 'subscription.order.failure'].includes(payload?.iyziEventType)) {
    throw new Error('Unsupported iyzico subscription webhook event type');
  }
  if (!payload?.iyziReferenceCode || !payload?.iyziEventType || !payload?.iyziEventTime) {
    const error = new Error('iyzico event envelope is incomplete');
    error.code = 'InvalidWebhookEnvelope';
    throw error;
  }
  const occurredAt = asDate(Number(payload.iyziEventTime));
  if (!occurredAt) throw new Error('iyzico event timestamp is invalid');
  const raw = Buffer.from(JSON.stringify(payload));
  try {
    const event = await BillingEvent.create({
      provider: 'iyzico',
      eventId: payload.iyziReferenceCode,
      eventType: payload.iyziEventType,
      occurredAt,
      externalCustomerId: payload.customerReferenceCode || null,
      externalSubscriptionId: payload.subscriptionReferenceCode || null,
      payloadHash: crypto.createHash('sha256').update(raw).digest('hex'),
      payload: minimizeIyzicoPayload(payload),
      payloadExpiresAt: payloadExpiresAt(),
    });
    return { event, duplicate: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const event = await BillingEvent.findOne({ provider: 'iyzico', eventId: payload.iyziReferenceCode });
    return { event, duplicate: true };
  }
}

async function processIyzicoEvent(event) {
  const subscription = await BillingSubscription.findOne({
    provider: 'iyzico',
    externalSubscriptionId: event.externalSubscriptionId,
  });
  if (!subscription) {
    // NEXT_PERIOD returns a new subscription reference. A late event for its
    // predecessor must not reopen/cancel the replacement or report its price.
    const predecessor = await BillingSubscription.findOne({ provider: 'iyzico', previousExternalSubscriptionId: event.externalSubscriptionId });
    if (predecessor) {
      event.status = 'ignored';
      event.lastError = 'Superseded subscription reference';
      event.processedAt = new Date();
      await event.save();
      return event;
    }
    // The first webhook may beat the checkout callback which creates the local
    // subscription. Keep it retryable instead of permanently dropping payment.
    throw new Error('No matching iyzico subscription yet');
  }
  const tenant = await Tenant.findById(subscription.tenantId);
  if (!tenant) throw new Error('iyzico subscription tenant was not found');
  if (subscription.planChangeId) {
    // For upgraded subscriptions reconcile actual order dates and amount;
    // NEXT_PERIOD's new reference may initially be PENDING.
    const detail = await iyzicoProvider.retrieveSubscription(subscription.externalSubscriptionId);
    const price = await PlanPrice.findById(subscription.planPriceId);
    const order = detail.data?.orders?.find((item) => item.referenceCode === event.payload?.orderReferenceCode);
    const change = await BillingPlanChange.findById(subscription.planChangeId);
    if (change?.paidAt && detail.data?.referenceCode === subscription.externalSubscriptionId
        && order && ['SUCCESS', 'FAILED'].includes(order.orderStatus)
        && Number(order.endPeriod) <= Number(change.periodEnd)
        && Number(order.startPeriod) >= Number(change.periodStart)
        && order.currencyCode === change.currency
        && Math.round(Number(order.price) * 100) === change.currentAmountMinor) {
      event.status = 'ignored';
      event.lastError = 'Pre-upgrade period order';
      event.processedAt = new Date();
      await event.save();
      return event;
    }
    if (detail.data?.referenceCode !== subscription.externalSubscriptionId
        || detail.data?.pricingPlanReferenceCode !== price?.externalPriceId
        || !order || order.currencyCode !== subscription.currency
        || Math.round(Number(order.price) * 100) !== subscription.amountMinor
        || (event.eventType === 'subscription.order.success' && order.orderStatus !== 'SUCCESS')
        || (event.eventType === 'subscription.order.failure' && order.orderStatus !== 'FAILED')) {
      throw new Error('Upgraded subscription order could not be verified');
    }
    if (event.eventType === 'subscription.order.success' && Number(order.startPeriod) >= Number(subscription.currentPeriodStart)
        && Number(order.endPeriod) > Number(order.startPeriod)) {
      subscription.currentPeriodStart = new Date(Number(order.startPeriod));
      subscription.currentPeriodEnd = new Date(Number(order.endPeriod));
    }
  }
  if (subscription.lastProviderEventAt && event.occurredAt < subscription.lastProviderEventAt) {
    if (event.eventType === 'subscription.order.success') {
      await queueIyzicoPaymentNotification(subscription, event.payload?.orderReferenceCode, {
        amountMinor: subscription.amountMinor, currency: subscription.currency, occurredAt: event.occurredAt,
      });
    }
    event.status = 'ignored';
    event.lastError = 'Out-of-order iyzico event';
    event.processedAt = new Date();
    await event.save();
    return event;
  }

  const success = event.eventType === 'subscription.order.success';
  const failure = event.eventType === 'subscription.order.failure';
  if (!success && !failure) {
    event.status = 'ignored';
    event.lastError = 'Unsupported iyzico event type';
    event.processedAt = new Date();
    await event.save();
    return event;
  }
  subscription.lastProviderEventAt = event.occurredAt;
  if (success) {
    if (!['deletion_pending', 'deleted'].includes(tenant.status)
        && !subscription.cancellationRequestedAt) {
      subscription.status = 'active';
      subscription.gracePeriodEndsAt = null;
    }
  } else {
    const graceDays = Math.max(1, Number(process.env.BILLING_GRACE_PERIOD_DAYS || 7));
    subscription.status = 'past_due';
    subscription.gracePeriodEndsAt ||= new Date(Date.now() + graceDays * 86400000);
  }
  await subscription.save();
  if (success && tenant.status === 'pending_payment' && !subscription.cancellationRequestedAt) {
    const price = await PlanPrice.findById(subscription.planPriceId).populate('planId');
    const plan = price?.planId;
    if (plan?.slug) {
      await tenantSubscriptionService.applyPlanToTenant(tenant, plan.slug, { source: 'provider_webhook' });
      await tenant.save();
    }
  }
  if (success) {
    await queueIyzicoPaymentNotification(subscription, event.payload?.orderReferenceCode, {
      amountMinor: subscription.amountMinor,
      currency: subscription.currency,
      occurredAt: event.occurredAt,
    });
  }
  if (['deletion_pending', 'deleted'].includes(tenant.status)
      && !['canceled', 'expired'].includes(subscription.status)) {
    await billingCancellationService.requestTenantCancellation(tenant._id, {
      effectiveFrom: 'immediately',
    });
  }
  event.accountId = subscription.accountId;
  event.tenantId = subscription.tenantId;
  event.status = 'processed';
  event.processedAt = new Date();
  event.lastError = '';
  await event.save();
  await tenantSubscriptionService.syncEntitlementState(tenant._id, { reason: `iyzico:${event.eventType}` });
  return event;
}

async function resolveTarget(event) {
  const data = event.payload?.data || {};
  const customTenantId = data.custom_data?.tenant_id || data.custom_data?.tenantId;
  const customAccountId = data.custom_data?.account_id || data.custom_data?.accountId;
  if (customTenantId) {
    const tenant = await Tenant.findById(customTenantId);
    if (tenant?.accountId) {
      const account = await Account.findById(tenant.accountId);
      if (account) return { tenant, account };
    }
  }

  const externalSubscriptionId = data.subscription_id || (event.eventType.startsWith('subscription.') ? data.id : null);
  if (externalSubscriptionId) {
    const subscription = await BillingSubscription.findOne({ provider: 'paddle', externalSubscriptionId });
    if (subscription) {
      const [tenant, account] = await Promise.all([
        Tenant.findById(subscription.tenantId),
        Account.findById(subscription.accountId),
      ]);
      if (tenant && account) return { tenant, account };
    }
  }

  let account = null;
  if (customAccountId) {
    account = await Account.findById(customAccountId);
  }
  if (!account && data.customer_id) {
    const billingAccount = await BillingAccount.findOne({ provider: 'paddle', externalCustomerId: data.customer_id });
    if (billingAccount) account = await Account.findById(billingAccount.accountId);
  }
  if (account) {
    const tenants = await Tenant.find({ accountId: account._id }).limit(2);
    if (tenants.length === 1) return { tenant: tenants[0], account };
  }
  return null;
}

async function syncSubscriptionEvent(event, tenant, account, billingAccount) {
  const data = event.payload.data || {};
  const externalSubscriptionId = data.id || data.subscription_id;
  if (!externalSubscriptionId) return null;

  let subscription = await BillingSubscription.findOne({ tenantId: tenant._id });
  if (subscription?.lastProviderEventAt && event.occurredAt < subscription.lastProviderEventAt) {
    return subscription;
  }

  const externalPriceId = extractPriceId(data);
  const planPrice = externalPriceId
    ? await PlanPrice.findOne({ provider: 'paddle', externalPriceId }).populate('planId')
    : null;
  const providerStatus = event.eventType === 'subscription.canceled'
    ? 'canceled'
    : normalizeStatus(data.status, subscription?.status || 'pending');
  const tenantDeleted = ['deletion_pending', 'deleted'].includes(tenant.status);
  const status = tenantDeleted
    && ['active', 'trialing'].includes(providerStatus)
    ? (subscription?.status || 'pending')
    : providerStatus;
  const graceDays = Math.max(1, Number(process.env.BILLING_GRACE_PERIOD_DAYS || 7));
  const now = new Date();
  const gracePeriodEndsAt = status === 'past_due'
    ? (subscription?.gracePeriodEndsAt || new Date(now.getTime() + graceDays * 86400000))
    : null;
  const update = {
    accountId: account._id,
    billingAccountId: billingAccount._id,
    provider: 'paddle',
    externalSubscriptionId,
    status,
    lastProviderEventAt: event.occurredAt,
    currentPeriodStart: asDate(data.current_billing_period?.starts_at),
    currentPeriodEnd: asDate(data.current_billing_period?.ends_at),
    trialEndsAt: asDate(data.next_billed_at && data.status === 'trialing' ? data.next_billed_at : null),
    cancelAtPeriodEnd: data.scheduled_change?.action === 'cancel',
    canceledAt: asDate(data.canceled_at),
    gracePeriodEndsAt,
  };
  if (planPrice) {
    update.planId = planPrice.planId?._id || planPrice.planId;
    update.planPriceId = planPrice._id;
    update.interval = planPrice.interval;
    update.currency = planPrice.currency;
    update.amountMinor = planPrice.amountMinor;
  }
  if (status === 'canceled') {
    update.cancellationLastError = '';
  }

  subscription = await BillingSubscription.findOneAndUpdate(
    { tenantId: tenant._id },
    { $set: update, $setOnInsert: { tenantId: tenant._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (tenantDeleted && !['canceled', 'expired'].includes(subscription.status)) {
    await billingCancellationService.requestTenantCancellation(tenant._id, {
      effectiveFrom: 'immediately',
    });
  }

  if (!tenantDeleted && (status === 'active' || status === 'trialing')) {
    if (planPrice?.planId?.slug) {
      await tenantSubscriptionService.applyPlanToTenant(tenant, planPrice.planId.slug, {
        source: 'provider_webhook',
      });
    }
  } else if (status === 'canceled') {
    await tenantSubscriptionService.applyPlanToTenant(tenant, 'free');
  }
  await tenant.save();
  await tenantSubscriptionService.syncEntitlementState(tenant._id, { reason: `paddle:${event.eventType}` });
  return subscription;
}

async function syncTransactionEvent(event, tenant, account) {
  const data = event.payload.data || {};
  const externalTransactionId = data.id;
  if (!externalTransactionId) return null;
  const relatedSubscription = data.subscription_id
    ? await BillingSubscription.findOne({
      tenantId: tenant._id,
      provider: 'paddle',
      externalSubscriptionId: data.subscription_id,
    })
    : await BillingSubscription.findOne({ tenantId: tenant._id });
  const totals = data.details?.totals || {};
  const statusMap = { completed: 'paid', paid: 'paid', past_due: 'past_due', canceled: 'void' };
  const status = statusMap[String(data.status || '').toLowerCase()]
    || (event.eventType.includes('payment_failed') ? 'past_due' : 'open');
  const invoice = await BillingInvoice.findOneAndUpdate(
    { provider: 'paddle', externalTransactionId },
    { $set: {
      accountId: account._id,
      tenantId: tenant._id,
      billingSubscriptionId: relatedSubscription?._id || null,
      invoiceNumber: data.invoice_number || '',
      status,
      currency: data.currency_code || relatedSubscription?.currency || 'USD',
      subtotalMinor: asMinor(totals.subtotal),
      taxMinor: asMinor(totals.tax),
      totalMinor: asMinor(totals.total),
      billedAt: asDate(data.billed_at) || event.occurredAt,
      paidAt: status === 'paid' ? (asDate(data.payments?.[0]?.captured_at) || event.occurredAt) : null,
      periodStart: asDate(data.billing_period?.starts_at),
      periodEnd: asDate(data.billing_period?.ends_at),
    } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (status === 'past_due' && relatedSubscription) {
    const graceDays = Math.max(1, Number(process.env.BILLING_GRACE_PERIOD_DAYS || 7));
    relatedSubscription.status = 'past_due';
    relatedSubscription.gracePeriodEndsAt ||= new Date(Date.now() + graceDays * 86400000);
    await relatedSubscription.save();
  }
  return invoice;
}

async function processEvent(eventId) {
  const event = await BillingEvent.findOneAndUpdate(
    { _id: eventId, status: { $in: ['pending', 'failed'] } },
    { $set: { status: 'processing' }, $inc: { attempts: 1 } },
    { new: true }
  );
  if (!event) return BillingEvent.findById(eventId);

  try {
    if (event.provider === 'iyzico' && event.eventType === 'internal.iyzico.payment.customer.notify') {
      return await processCustomerPaymentNotification(event);
    }
    if (event.provider === 'iyzico' && ['internal.iyzico.checkout.reconcile', 'internal.iyzico.payment.notify'].includes(event.eventType)) {
      return await processInternalIyzicoEvent(event);
    }
    if (event.provider === 'iyzico') return await processIyzicoEvent(event);
    const target = await resolveTarget(event);
    if (!target) {
      event.status = 'ignored';
      event.lastError = 'No matching account';
      event.processedAt = new Date();
      await event.save();
      return event;
    }
    const { tenant, account } = target;
    const data = event.payload.data || {};
    const billingAccount = await BillingAccount.findOneAndUpdate(
      { accountId: account._id },
      { $set: {
        provider: 'paddle',
        ...(data.customer_id ? {
          externalCustomerId: data.customer_id,
          status: 'active',
          paymentMethodStatus: 'provider_verified',
        } : {}),
      }, $setOnInsert: { accountId: account._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    event.accountId = account._id;
    event.tenantId = tenant._id;
    if (SUBSCRIPTION_EVENTS.has(event.eventType)) {
      await syncSubscriptionEvent(event, tenant, account, billingAccount);
    } else if (event.eventType.startsWith('transaction.')) {
      const invoice = await syncTransactionEvent(event, tenant, account);
      if (event.eventType === 'transaction.completed' && invoice?.status === 'paid') {
        const subscription = await BillingSubscription.findOne({ tenantId: tenant._id });
        await notifySuccessfulPayment({
          tenant,
          subscription,
          amountMinor: invoice.totalMinor,
          currency: invoice.currency,
          occurredAt: invoice.paidAt || event.occurredAt,
        });
      }
    } else {
      event.status = 'ignored';
      event.lastError = 'Unsupported event type';
      event.processedAt = new Date();
      await event.save();
      return event;
    }
    event.status = 'processed';
    event.processedAt = new Date();
    event.lastError = '';
    await event.save();
    return event;
  } catch (error) {
    event.status = 'failed';
    event.lastError = String(error?.message || error).slice(0, 1000);
    await event.save();
    throw error;
  }
}

async function reprocessPending({ limit = 100 } = {}) {
  await BillingEvent.updateMany(
    { status: 'processing', updatedAt: { $lte: new Date(Date.now() - 5 * 60 * 1000) } },
    { $set: { status: 'failed', lastError: 'Recovered stale processing lease' } }
  );
  const events = await BillingEvent.find({ status: { $in: ['pending', 'failed'] } })
    .sort({ occurredAt: 1 })
    .limit(Math.max(1, Math.min(500, limit)))
    .select('_id');
  const results = [];
  for (const event of events) {
    try {
      await processEvent(event._id);
      results.push({ eventId: String(event._id), processed: true });
    } catch (error) {
      results.push({ eventId: String(event._id), processed: false, error: error.message });
    }
  }
  return results;
}

async function redactExpiredPayloads({ limit = 500, now = new Date() } = {}) {
  const legacyCutoff = new Date(now.getTime() - billingEventPayloadRetentionDays() * 86400000);
  const events = await BillingEvent.find({
    status: { $in: ['processed', 'ignored'] },
    payload: { $ne: null },
    $or: [
      { payloadExpiresAt: { $ne: null, $lte: now } },
      { payloadExpiresAt: null, createdAt: { $lte: legacyCutoff } },
    ],
  })
    .sort({ payloadExpiresAt: 1 })
    .limit(Math.max(1, Math.min(2000, limit)))
    .select('_id');
  if (events.length === 0) return { redacted: 0 };
  const result = await BillingEvent.updateMany(
    { _id: { $in: events.map((event) => event._id) }, payload: { $ne: null } },
    { $set: { payload: null, payloadRedactedAt: now } }
  );
  return { redacted: result.modifiedCount || 0 };
}

module.exports = {
  acceptIyzicoEvent,
  acceptPaddleEvent,
  billingEventPayloadRetentionDays,
  minimizeIyzicoPayload,
  minimizePaddlePayload,
  payloadExpiresAt,
  processEvent,
  processIyzicoEvent,
  queueIyzicoCheckoutReconciliation,
  queueCustomerPaymentNotification,
  queuePlanChangePaymentNotification: (subscription, change) => queueInternalIyzicoEvent({
    eventId: `payment-notification:plan-change:${change.externalPaymentId}`,
    eventType: 'internal.iyzico.payment.notify', subscription, occurredAt: change.paidAt,
    payload: {
      orderReferenceCode: `plan-change:${change.externalPaymentId}`, amountMinor: change.amountMinor, currency: change.currency,
      paymentKind: 'plan_change', planName: change.toPlanName, interval: change.interval,
      recurringAmountMinor: change.recurringAmountMinor, nextBillingAt: change.periodEnd,
    },
  }),
  redactExpiredPayloads,
  reprocessPending,
};
