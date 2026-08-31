export function statusLabel(t, status) {
  return status ? t(`billing.status.${status}`, { defaultValue: status }) : '—'
}

export function activePlanStatus(t, tenantPlan, subscription) {
  if (subscription?.status) return statusLabel(t, subscription.status)
  if (tenantPlan?.slug === 'enterprise') return t('billing.status.contract')
  if (tenantPlan?.slug && tenantPlan.slug !== 'free') return t('billing.status.commercial')
  return t('billing.status.free')
}

export function checkoutButtonLabel(t, { current, enterprise, checkoutAvailable, checkoutReady, hasProfile, hasSubscription }) {
  if (current) return t('billing.checkout.current')
  if (enterprise) return t('billing.checkout.enterprise')
  if (hasSubscription) return t('billing.checkout.hasSubscription')
  if (!hasProfile) return t('billing.checkout.profileRequired')
  if (!checkoutAvailable || !checkoutReady) return t('billing.checkout.unavailable')
  return t('billing.checkout.start')
}
