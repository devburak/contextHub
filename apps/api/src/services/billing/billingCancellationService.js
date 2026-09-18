const crypto = require('node:crypto');
const { BillingSubscription, BillingPlanChange } = require('@contexthub/common');
const { isBillingProviderEnabled } = require('../../lib/billingConfig');
const paddleProvider = require('./paddleProvider');
const iyzicoProvider = require('./iyzicoProvider');

const TERMINAL_STATUSES = new Set(['canceled', 'expired']);

function providerFor(name) {
  if (name === 'paddle') return paddleProvider;
  if (name === 'iyzico') return iyzicoProvider;
  return null;
}

async function requestTenantCancellation(tenantId, options = {}) {
  const effectiveFrom = options.effectiveFrom === 'next_billing_period'
    ? 'next_billing_period'
    : 'immediately';
  const subscription = await BillingSubscription.findOne({ tenantId });
  if (!subscription) return { status: 'not_subscribed', requested: false };
  if (TERMINAL_STATUSES.has(subscription.status)) {
    return { status: subscription.status, requested: false, terminal: true };
  }

  const cancellationRequestId = subscription.cancellationRequestId || crypto.randomUUID();
  subscription.cancellationRequestId = cancellationRequestId;
  subscription.cancellationRequestedAt = subscription.cancellationRequestedAt || new Date();
  subscription.cancellationEffectiveFrom = effectiveFrom;
  subscription.cancellationAttempts = (subscription.cancellationAttempts || 0) + 1;
  subscription.cancellationLastError = '';
  await subscription.save();

  // Do not cancel the old reference while a NEXT_PERIOD replacement is being
  // created. The existing cancellation retry loop will cancel the new one.
  const pendingChange = await BillingPlanChange.exists({ tenantId, active: true,
    status: { $in: ['payment_confirmed', 'upgrade_requested', 'scheduled', 'needs_review'] },
    paidAt: { $ne: null },
  });
  if (pendingChange) return { status: 'pending', requested: true, retryable: true, cancellationRequestId, error: 'Plan change reconciliation required before cancellation' };

  if (subscription.provider === 'manual' || !subscription.externalSubscriptionId) {
    subscription.status = 'canceled';
    subscription.cancelAtPeriodEnd = false;
    subscription.canceledAt = new Date();
    await subscription.save();
    return { status: 'canceled', requested: true, cancellationRequestId };
  }

  const provider = providerFor(subscription.provider);
  if (!provider || !isBillingProviderEnabled(subscription.provider)) {
    subscription.cancellationLastError = `Billing provider is unavailable: ${subscription.provider}`;
    await subscription.save();
    return {
      status: 'pending',
      requested: true,
      retryable: true,
      cancellationRequestId,
      error: subscription.cancellationLastError,
    };
  }

  try {
    if (subscription.provider === 'iyzico' && subscription.planChangeId) {
      // NEXT_PERIOD can temporarily have an old parent and a pending child.
      // Check/cancel BOTH references. On retry, read terminal state instead of
      // blindly replaying a successful cancellation against either agreement.
      const references = [...new Set([subscription.externalSubscriptionId, subscription.previousExternalSubscriptionId].filter(Boolean))];
      for (const reference of references) {
        const detail = await provider.retrieveSubscription(reference);
        if (detail.data?.referenceCode !== reference) throw new Error('Cancellation subscription reference mismatch');
        if (['CANCELED', 'EXPIRED', 'UPGRADED'].includes(detail.data.subscriptionStatus)) continue;
        if (!['ACTIVE', 'PENDING', 'UNPAID'].includes(detail.data.subscriptionStatus)) throw new Error('Cancellation provider status needs reconciliation');
        await provider.cancelSubscription({ externalSubscriptionId: reference });
      }
      subscription.status = 'canceled';
      subscription.cancelAtPeriodEnd = false;
      subscription.canceledAt = new Date();
      subscription.cancellationLastError = '';
      await subscription.save();
      return { status: 'canceled', requested: true, cancellationRequestId };
    }
    const result = await provider.cancelSubscription({
      externalSubscriptionId: subscription.externalSubscriptionId,
      effectiveFrom,
    });
    subscription.cancelAtPeriodEnd = Boolean(result.cancelAtPeriodEnd);
    if (result.status === 'canceled') {
      subscription.status = 'canceled';
      subscription.canceledAt = result.canceledAt ? new Date(result.canceledAt) : new Date();
    }
    subscription.cancellationLastError = '';
    await subscription.save();
    return {
      status: subscription.status,
      requested: true,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      effectiveAt: result.effectiveAt || null,
      cancellationRequestId,
    };
  } catch (error) {
    subscription.cancellationLastError = String(error.message || error).slice(0, 2000);
    await subscription.save();
    return {
      status: 'pending',
      requested: true,
      retryable: true,
      cancellationRequestId,
      error: subscription.cancellationLastError,
    };
  }
}

module.exports = { requestTenantCancellation };
