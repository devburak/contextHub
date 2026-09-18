const crypto = require('node:crypto');
const { BillingAccount, BillingPlanChange, BillingSubscription, PlanPrice, Tenant } = require('@contexthub/common');
const { envFlag, isAccountBillingEnabled, isBillingCheckoutEnabledForTenant, isBillingProviderEnabled } = require('../../lib/billingConfig');
const { decryptBillingPii, encryptBillingPii } = require('./billingPiiCrypto');
const provider = require('./iyzicoProvider');
const tenantSubscriptions = require('../tenantSubscriptionService');
const { paidPeriod, proratedDifference } = require('./planChangePolicy');

const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');
const problem = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });

function enabled(tenantId) {
  return envFlag('BILLING_PLAN_CHANGES_ENABLED', false) && isAccountBillingEnabled()
    && isBillingProviderEnabled('iyzico') && isBillingCheckoutEnabledForTenant(tenantId);
}

function serialize(change) {
  if (!change) return null;
  return {
    id: String(change._id), tenantId: String(change.tenantId), status: change.status,
    fromPlanName: change.fromPlanName, toPlanName: change.toPlanName,
    amountMinor: change.amountMinor, recurringAmountMinor: change.recurringAmountMinor,
    currentAmountMinor: change.currentAmountMinor, currency: change.currency, interval: change.interval,
    periodStart: change.periodStart, renewalAt: change.periodEnd, quotedAt: change.quotedAt,
    quoteExpiresAt: change.quoteExpiresAt, paid: Boolean(change.paidAt),
    entitlementApplied: Boolean(change.entitlementAppliedAt), taxIncluded: true,
    proration: 'remaining_time',
  };
}

async function scope(tenantId) {
  return require('./billingService').getAccountForTenant(tenantId);
}

async function context(tenantId, priceId) {
  if (!enabled(tenantId)) throw problem('PlanChangeUnavailable', 'Paket yükseltme henüz bu hesap için etkin değil.', 503);
  const { tenant, account } = await scope(tenantId);
  const [subscription, target, billingAccount] = await Promise.all([
    BillingSubscription.findOne({ tenantId: tenant._id, accountId: account._id }).populate('planId planPriceId'),
    PlanPrice.findById(priceId).populate('planId'),
    BillingAccount.findOne({ accountId: account._id }).select('+taxIdEncrypted +taxId'),
  ]);
  if (tenant.status !== 'active' || subscription?.provider !== 'iyzico' || subscription.status !== 'active'
      || subscription.cancelAtPeriodEnd || subscription.cancellationRequestedAt
      || subscription.scheduledPlanId || subscription.scheduledPlanPriceId
      || subscription.planId?.slug !== 'pro' || tenant.currentPlan?.slug !== 'pro'
      || target?.planId?.slug !== 'promax' || target.planId.isActive === false || !target.active
      || target.provider !== 'iyzico' || target.currency !== 'TRY' || subscription.currency !== 'TRY'
      || target.interval !== subscription.interval || !target.externalPriceId
      || billingAccount?.country !== 'TR' || billingAccount.provider !== 'iyzico') {
    throw problem('PlanChangeUnavailable', 'Bu geçiş yalnızca aktif Pro aboneliğinde, aynı aylık/yıllık dönemle yapılabilir.');
  }
  const profile = require('./billingService').serializeBillingAccount(billingAccount);
  if (!profile.profileComplete || !profile.commercialReadiness.agreementAccepted) {
    throw problem('BillingProfileIncomplete', 'Önce fatura bilgilerinizi ve sözleşme onayınızı tamamlayın.', 422);
  }
  const result = await provider.retrieveSubscription(subscription.externalSubscriptionId);
  const period = paidPeriod(result.data, subscription);
  const [oldPlan, newPlan] = await Promise.all([
    provider.retrievePricingPlan(subscription.planPriceId.externalPriceId), provider.retrievePricingPlan(target.externalPriceId),
  ]);
  const expectedInterval = subscription.interval === 'year' ? 'YEARLY' : 'MONTHLY';
  if (!oldPlan.data?.productReferenceCode || oldPlan.data.productReferenceCode !== newPlan.data?.productReferenceCode
      || oldPlan.data.referenceCode !== subscription.planPriceId.externalPriceId || newPlan.data.referenceCode !== target.externalPriceId
      || [oldPlan.data, newPlan.data].some((plan) => plan.status !== 'ACTIVE' || plan.currencyCode !== 'TRY'
        || plan.paymentInterval !== expectedInterval || Number(plan.paymentIntervalCount) !== 1 || plan.planPaymentType !== 'RECURRING')
      || Math.round(Number(newPlan.data.price) * 100) !== target.amountMinor
      || Math.round(Number(oldPlan.data.price) * 100) !== subscription.amountMinor) {
    throw problem('PlanChangeUnavailable', 'Ödeme planlarının fiyatı, ürünü veya dönemi eşleşmiyor. Destekle iletişime geçin.');
  }
  // Leave enough time for the hosted form to expire before the renewal boundary.
  if (period.periodEnd.getTime() - Date.now() < 2 * 60 * 60 * 1000) {
    throw problem('PlanChangeUnavailable', 'Yenileme çok yakın. Yenilemeden sonra tekrar deneyin.');
  }
  return { tenant, account, subscription, target, billingAccount, ...period };
}

async function createQuote(tenantId, priceId, actorUserId) {
  const state = await context(tenantId, priceId);
  const now = new Date();
  await BillingPlanChange.updateMany({ tenantId, status: 'quoted', quoteExpiresAt: { $lte: now } }, { $set: { status: 'expired', active: false } });
  const existing = await BillingPlanChange.findOne({ tenantId, active: true });
  if (existing) {
    if (existing.status === 'quoted' && String(existing.toPriceId) === String(priceId)
        && String(existing.actorUserId) === String(actorUserId)) return serialize(existing);
    throw problem('PlanChangeInProgress', 'Bu hesap için devam eden bir paket geçişi var. Yeniden ödeme yapmayın.');
  }
  const { amountMinor } = proratedDifference({ currentAmountMinor: state.subscription.amountMinor, nextAmountMinor: state.target.amountMinor, ...state, now });
  try {
    const change = await BillingPlanChange.create({
      tenantId: state.tenant._id, accountId: state.account._id, subscriptionId: state.subscription._id,
      actorUserId, fromPriceId: state.subscription.planPriceId._id, toPriceId: state.target._id,
      fromExternalPriceId: state.subscription.planPriceId.externalPriceId, toExternalPriceId: state.target.externalPriceId,
      fromPlanName: state.subscription.planId.name, toPlanName: state.target.planId.name,
      currentAmountMinor: state.subscription.amountMinor, recurringAmountMinor: state.target.amountMinor,
      amountMinor, currency: 'TRY', interval: state.subscription.interval,
      periodStart: state.periodStart, periodEnd: state.periodEnd, quotedAt: now,
      quoteExpiresAt: new Date(now.getTime() + 5 * 60 * 1000), externalSubscriptionId: state.subscription.externalSubscriptionId,
    });
    return serialize(change);
  } catch (error) {
    if (error.code === 11000) throw problem('PlanChangeInProgress', 'Devam eden paket geçişini kontrol edin.');
    throw error;
  }
}

async function findScoped(tenantId, id) {
  const { tenant, account } = await scope(tenantId);
  const change = await BillingPlanChange.findOne({ _id: id, tenantId: tenant._id, accountId: account._id });
  if (!change) throw problem('PlanChangeNotFound', 'Paket geçişi bulunamadı.', 404);
  return change;
}

async function confirm(tenantId, id, { actorUserId, customerIp } = {}) {
  let change = await findScoped(tenantId, id);
  if (String(change.actorUserId) !== String(actorUserId)) throw problem('PlanChangeNotFound', 'Geçiş teklifini kendi hesabınızla yeniden açın.', 403);
  if (!enabled(tenantId)) throw problem('PlanChangeUnavailable', 'Paket geçişi bu hesap için etkin değil.', 503);
  // An accepted intent is never initialized twice, including after reload/retry.
  if (change.status !== 'quoted') {
    if (change.status === 'awaiting_payment' && change.checkoutExpiresAt > new Date()) {
      const stored = await BillingPlanChange.findById(change._id).select('+checkoutEncrypted');
      if (stored.checkoutEncrypted) return { change: serialize(change),
        ...JSON.parse(decryptBillingPii(stored.checkoutEncrypted)),
        expiresInSeconds: Math.max(1, Math.floor((change.checkoutExpiresAt.getTime() - Date.now()) / 1000)),
      };
    }
    return { change: serialize(change), alreadyStarted: true };
  }
  if (change.quoteExpiresAt <= new Date()) throw problem('PlanChangeQuoteExpired', 'Fiyat teklifinin süresi doldu. Farkı yeniden hesaplayın.');
  const state = await context(tenantId, change.toPriceId);
  if (state.subscription.externalSubscriptionId !== change.externalSubscriptionId
      || String(state.subscription.planPriceId._id) !== String(change.fromPriceId)
      || state.subscription.planPriceId.externalPriceId !== change.fromExternalPriceId || state.target.externalPriceId !== change.toExternalPriceId
      || state.subscription.amountMinor !== change.currentAmountMinor || state.target.amountMinor !== change.recurringAmountMinor
      || state.periodStart.getTime() !== change.periodStart.getTime() || state.periodEnd.getTime() !== change.periodEnd.getTime()) {
    throw problem('PlanChangeQuoteExpired', 'Abonelik bilgileri değişti. Farkı yeniden hesaplayın.');
  }
  // Validate encryption BEFORE creating a provider form.
  encryptBillingPii('preflight');
  const billingAccount = state.billingAccount.toObject();
  billingAccount.taxId = billingAccount.taxIdEncrypted ? decryptBillingPii(billingAccount.taxIdEncrypted) : billingAccount.taxId;
  change = await BillingPlanChange.findOneAndUpdate({ _id: id, status: 'quoted', quoteExpiresAt: { $gt: new Date() } }, {
    $set: { status: 'initializing', acceptedAt: new Date(), conversationId: `ctx_upgrade_${id}` },
  }, { new: true });
  if (!change) throw problem('PlanChangeInProgress', 'Paket geçişi zaten başlatılmış. Durumunu kontrol edin.');
  try {
    const checkout = await provider.createPlanChangeCheckout({ billingAccount, tenant: state.tenant, change, customerIp });
    const expiresInSeconds = Math.max(1, Math.min(3600, Number(checkout.expiresInSeconds) || 1800));
    change.tokenHash = hashToken(checkout.checkoutToken);
    change.tokenEncrypted = encryptBillingPii(checkout.checkoutToken);
    change.checkoutExpiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    change.checkoutEncrypted = encryptBillingPii(JSON.stringify({ checkoutContent: checkout.checkoutContent, checkoutUrl: checkout.checkoutUrl }));
    change.status = 'awaiting_payment';
    await change.save();
    return { change: serialize(change), checkoutContent: checkout.checkoutContent, checkoutUrl: checkout.checkoutUrl, expiresInSeconds };
  } catch (_error) {
    await BillingPlanChange.updateOne({ _id: id, status: 'initializing' }, { $set: { status: 'needs_review', lastError: 'Checkout initialization needs reconciliation; do not initialize again' } });
    throw problem('PlanChangeNeedsReview', 'İşlem sonucu kontrol edilmeli. Yeni ödeme başlatmayın.');
  }
}

async function review(change, reason) {
  console.warn('[Billing] Plan change requires reconciliation', { changeId: String(change._id), paid: Boolean(change.paidAt) });
  await BillingPlanChange.updateOne({ _id: change._id }, { $set: { status: 'needs_review', lastError: reason } });
  return BillingPlanChange.findById(change._id);
}

async function finishScheduled(change) {
  const price = await PlanPrice.findById(change.toPriceId).populate('planId');
  const subscription = await BillingSubscription.findOneAndUpdate({
    _id: change.subscriptionId, tenantId: change.tenantId, accountId: change.accountId,
    externalSubscriptionId: { $in: [change.externalSubscriptionId, change.nextExternalSubscriptionId] },
  }, { $set: {
    externalSubscriptionId: change.nextExternalSubscriptionId,
    previousExternalSubscriptionId: change.nextExternalSubscriptionId === change.externalSubscriptionId ? null : change.externalSubscriptionId,
    planChangeId: change._id, planId: price.planId._id, planPriceId: price._id,
    amountMinor: change.recurringAmountMinor, currentPeriodStart: change.periodStart, currentPeriodEnd: change.periodEnd,
  } }, { new: true });
  if (!subscription) return review(change, 'Subscription changed while scheduling renewal');
  const notifications = require('./billingWebhookService');
  const notification = await notifications.queuePlanChangePaymentNotification(subscription, change);
  change.status = 'completed';
  change.completedAt = new Date();
  change.active = false;
  change.lastError = '';
  // Retain hashes and financial evidence, not reusable checkout credentials.
  change.tokenEncrypted = undefined;
  change.checkoutEncrypted = undefined;
  await change.save();
  if (notification?._id) setImmediate(() => notifications.processEvent(notification._id).catch(() => {
    console.error('[Billing] Plan change notification queued for retry');
  }));
  return change;
}

async function applyPaidChange(change) {
  if (change.status === 'scheduled') return finishScheduled(change);
  // This is a non-idempotent provider mutation. Claim durably before calling it;
  // a crash/timeout is never automatically replayed against the provider.
  change = await BillingPlanChange.findOneAndUpdate({ _id: change._id, status: 'payment_confirmed' }, {
    $set: { status: 'upgrade_requested', upgradeRequestedAt: new Date() },
  }, { new: true });
  if (!change) return null;
  const [tenant, subscription, price] = await Promise.all([
    Tenant.findById(change.tenantId), BillingSubscription.findById(change.subscriptionId), PlanPrice.findById(change.toPriceId).populate('planId'),
  ]);
  if (!tenant || tenant.status !== 'active' || !subscription || subscription.status !== 'active'
      || subscription.cancellationRequestedAt || subscription.externalSubscriptionId !== change.externalSubscriptionId
      || String(subscription.planPriceId) !== String(change.fromPriceId)
      || new Date() >= change.periodEnd || price?.amountMinor !== change.recurringAmountMinor
      || price.externalPriceId !== change.toExternalPriceId || price.planId?.slug !== 'promax'
      || price.provider !== 'iyzico' || price.currency !== change.currency || price.interval !== change.interval) {
    return review(change, 'Payment verified; subscription no longer eligible. Manual resolution required.');
  }
  try {
    // Access changes as soon as the one-time payment is verified. Preserve the
    // tenant's usage/billing-cycle anchors; this is NOT a new subscription.
    const activated = await BillingSubscription.updateOne({ _id: subscription._id, status: 'active',
      externalSubscriptionId: change.externalSubscriptionId, cancellationRequestedAt: null,
    }, { $set: { planId: price.planId._id, planChangeId: change._id } });
    if (!activated.matchedCount) return review(change, 'Subscription became unavailable after payment');
    await tenantSubscriptions.applyPlanToTenant(tenant, price.planId.slug, { source: 'provider_checkout', trackActivation: false });
    const applied = await Tenant.updateOne({ _id: tenant._id, accountId: change.accountId, status: 'active' }, {
      $set: { plan: tenant.plan, currentPlan: tenant.currentPlan },
    });
    if (!applied.matchedCount) return review(change, 'Tenant became unavailable after payment');
    await tenantSubscriptions.syncEntitlementState(tenant._id, { reason: 'plan_change_payment_verified' });
    change.entitlementAppliedAt = new Date();
    await change.save();
    const result = await provider.schedulePlanChange({ externalSubscriptionId: change.externalSubscriptionId, externalPriceId: price.externalPriceId });
    const data = result.data;
    if (!data?.referenceCode || data.pricingPlanReferenceCode !== price.externalPriceId
        || !['ACTIVE', 'PENDING'].includes(data.subscriptionStatus)) {
      return review(change, 'Upgrade response needs provider reconciliation');
    }
    change.nextExternalSubscriptionId = data.referenceCode;
    change.status = 'scheduled';
    await change.save();
    return finishScheduled(change);
  } catch (_error) {
    return review(change, 'Payment verified; renewal scheduling needs reconciliation. Never collect the difference again.');
  }
}

async function reconcileOne(id) {
  let change = await BillingPlanChange.findById(id).select('+tokenEncrypted');
  if (!change || !change.active) return change;
  if (['scheduled', 'payment_confirmed'].includes(change.status)) return (await applyPaidChange(change)) || BillingPlanChange.findById(id);
  if (!['awaiting_payment', 'needs_review'].includes(change.status) || change.paidAt || !change.tokenEncrypted) return change;
  const now = new Date();
  // Cluster-safe read/reconciliation throttle; no payment write occurs here.
  const claimed = await BillingPlanChange.findOneAndUpdate({ _id: id, paidAt: null,
    $or: [{ nextCheckAt: null }, { nextCheckAt: { $lte: now } }],
  }, { $set: { nextCheckAt: new Date(now.getTime() + 30_000) } }, { new: true });
  if (!claimed) return change;
  const token = decryptBillingPii(change.tokenEncrypted);
  try {
    const result = await provider.retrieveReviewCheckout(token, change.conversationId);
    provider.verifyReviewCheckoutResponse(result, { checkoutToken: token, conversationId: change.conversationId });
    if (result.paymentStatus !== 'SUCCESS') {
      // A declined card is not a terminal checkout: the same form may retry.
      // Keep the lock until an operator confirms closure, avoiding two live CFs.
      if (change.checkoutExpiresAt <= now) return review(change, 'Checkout expired; confirm payment state before releasing the intent');
      return change;
    }
    if (Math.round(Number(result.paidPrice) * 100) !== change.amountMinor
        || Math.round(Number(result.price) * 100) !== change.amountMinor
        || result.currency !== change.currency || !result.paymentId) {
      return review(change, 'Payment amount/currency does not match accepted quote');
    }
    change = await BillingPlanChange.findOneAndUpdate({ _id: id, paidAt: null }, { $set: {
      status: 'payment_confirmed', paidAt: now, externalPaymentId: String(result.paymentId), lastError: '',
    } }, { new: true });
    return change ? (await applyPaidChange(change)) || BillingPlanChange.findById(id) : BillingPlanChange.findById(id);
  } catch (_error) {
    if (change?.checkoutExpiresAt <= now) return review(change, 'Payment verification needs reconciliation');
    return BillingPlanChange.findById(id);
  }
}

async function completeByToken(token) {
  const change = await BillingPlanChange.findOne({ tokenHash: hashToken(token) });
  if (!change) return null;
  // Callback is a wake-up only. No unsigned fields grant access.
  const result = await reconcileOne(change._id);
  return { completed: result?.status === 'completed', planChange: true, pending: result?.status !== 'completed' };
}

async function getStatus(tenantId, id) {
  const change = await findScoped(tenantId, id);
  // Polling wakes recovery; the durable processor still owns all verification.
  return serialize(await reconcileOne(change._id));
}

async function recover() {
  await BillingPlanChange.updateMany({ active: true, status: { $in: ['initializing', 'upgrade_requested'] }, updatedAt: { $lt: new Date(Date.now() - 5 * 60_000) } }, {
    $set: { status: 'needs_review', lastError: 'Interrupted provider operation; do not automatically replay' },
  });
  const changes = await BillingPlanChange.find({ active: true, status: { $in: ['awaiting_payment', 'payment_confirmed', 'scheduled', 'needs_review'] } }).sort({ updatedAt: 1 }).limit(100).select('_id');
  for (const change of changes) await reconcileOne(change._id).catch(() => {});
}

module.exports = { enabled, serialize, createQuote, confirm, getStatus, completeByToken, reconcileOne, recover };
