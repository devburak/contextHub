export function statusLabel(status) {
  return ({ free: 'Ücretsiz', active: 'Aktif', trialing: 'Deneme', past_due: 'Ödeme bekliyor', canceled: 'İptal', paid: 'Ödendi', open: 'Açık' })[status] || status || '—'
}

export function activePlanStatus(tenantPlan, subscription) {
  if (subscription?.status) return statusLabel(subscription.status)
  if (tenantPlan?.slug === 'enterprise') return 'Sözleşmeli'
  if (tenantPlan?.slug && tenantPlan.slug !== 'free') return 'Ticari paket'
  return 'Ücretsiz'
}

export function checkoutButtonLabel({ current, enterprise, checkoutAvailable, checkoutReady, hasProfile, hasSubscription }) {
  if (current) return 'Mevcut paket'
  if (enterprise) return 'Teklif ve sözleşme'
  if (hasSubscription) return 'Abonelik ekranından yönetin'
  if (!hasProfile) return 'Önce fatura bilgilerini tamamlayın'
  if (!checkoutAvailable || !checkoutReady) return 'Ödeme altyapısı hazırlanıyor'
  return 'Güvenli ödemeye geç'
}
