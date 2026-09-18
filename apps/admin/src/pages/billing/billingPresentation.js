export function statusLabel(t, status) {
  return status ? t(`billing.status.${status}`, { defaultValue: status }) : '—'
}

export function activePlanStatus(t, tenantPlan, subscription) {
  if (tenantPlan?.slug === 'enterprise') return t('billing.status.contract')
  if (subscription?.status) return statusLabel(t, subscription.status)
  if (tenantPlan?.slug && tenantPlan.slug !== 'free') return t('billing.status.commercial')
  return t('billing.status.free')
}

export function contractPresentation(overview) {
  const managed = overview?.tenant?.plan?.slug === 'enterprise'
  const charge = overview?.charges?.subscription
  return {
    managed,
    // An unset negotiated amount is not a zero-price contract or a list price.
    pricePending: managed && (!charge || charge.isEstimated || charge.amountMinor == null),
  }
}

export function checkoutButtonLabel(t, { current, enterprise, checkoutAvailable, checkoutReady, hasProfile, hasSubscription }) {
  if (current) return t('billing.checkout.current')
  if (enterprise) return t('billing.checkout.enterprise')
  if (hasSubscription) return t('billing.checkout.hasSubscription')
  if (!hasProfile) return t('billing.checkout.profileRequired')
  if (!checkoutAvailable || !checkoutReady) return t('billing.checkout.unavailable')
  return t('billing.checkout.start')
}
