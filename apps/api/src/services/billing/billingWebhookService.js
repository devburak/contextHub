const crypto = require('crypto');
const {
  Account,
  BillingAccount,
  BillingEvent,
  BillingInvoice,
  BillingSubscription,
  PlanPrice,
  Tenant,
} = require('@contexthub/common');
const tenantSubscriptionService = require('../tenantSubscriptionService');
const paddleProvider = require('./paddleProvider');

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
      payload,
    });
    return { event, duplicate: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const event = await BillingEvent.findOne({ provider: 'paddle', eventId: payload.event_id });
    return { event, duplicate: true };
  }
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
  const status = event.eventType === 'subscription.canceled'
    ? 'canceled'
    : normalizeStatus(data.status, subscription?.status || 'pending');
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

  subscription = await BillingSubscription.findOneAndUpdate(
    { tenantId: tenant._id },
    { $set: update, $setOnInsert: { tenantId: tenant._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (status === 'active' || status === 'trialing') {
    if (planPrice?.planId?.slug) await tenantSubscriptionService.applyPlanToTenant(tenant, planPrice.planId.slug);
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
        ...(data.customer_id ? { externalCustomerId: data.customer_id, status: 'active' } : {}),
      }, $setOnInsert: { accountId: account._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    event.accountId = account._id;
    event.tenantId = tenant._id;
    if (SUBSCRIPTION_EVENTS.has(event.eventType)) {
      await syncSubscriptionEvent(event, tenant, account, billingAccount);
    } else if (event.eventType.startsWith('transaction.')) {
      await syncTransactionEvent(event, tenant, account);
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

module.exports = { acceptPaddleEvent, processEvent, reprocessPending };
