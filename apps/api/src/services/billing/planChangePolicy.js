// Money is always integer minor units. The quote freezes this instant until
// expiry; client clocks, price input, and 30-day approximations are not used.
function proratedDifference({ currentAmountMinor, nextAmountMinor, periodStart, periodEnd, now = new Date() }) {
  const start = new Date(periodStart).getTime();
  const end = new Date(periodEnd).getTime();
  const at = new Date(now).getTime();
  if (![currentAmountMinor, nextAmountMinor].every(Number.isSafeInteger)
      || currentAmountMinor <= 0 || nextAmountMinor <= currentAmountMinor
      || !periodStart || !periodEnd || ![start, end, at].every(Number.isFinite)
      || start > at || end <= at || end <= start) {
    throw Object.assign(new Error('Geçerli bir ücretli dönem ve daha yüksek paket fiyatı gerekiyor.'), { code: 'PlanChangeUnavailable', statusCode: 409 });
  }
  // BigInt prevents multiplication overflow and rounds half up to one kuruş.
  const duration = BigInt(end - start);
  const numerator = BigInt(nextAmountMinor - currentAmountMinor) * BigInt(end - at);
  const amountMinor = Number((2n * numerator + duration) / (2n * duration));
  if (amountMinor < 1) throw Object.assign(new Error('Yenileme çok yakın. Yenilemeden sonra tekrar deneyin.'), { code: 'PlanChangeUnavailable', statusCode: 409 });
  return { amountMinor, remainingMs: end - at, periodMs: end - start };
}

function paidPeriod(data, subscription, now = new Date()) {
  if (data?.referenceCode !== subscription.externalSubscriptionId || data?.subscriptionStatus !== 'ACTIVE'
      || data?.pricingPlanReferenceCode !== subscription.planPriceId?.externalPriceId) {
    throw Object.assign(new Error('Aboneliğin ödeme sağlayıcısındaki durumu geçişe uygun değil.'), { code: 'PlanChangeUnavailable', statusCode: 409 });
  }
  const orders = (data.orders || []).filter((order) => order.orderStatus === 'SUCCESS'
    && Number(order.startPeriod) <= now.getTime() && Number(order.endPeriod) > now.getTime()
    && order.currencyCode === subscription.currency
    && Math.round(Number(order.price) * 100) === subscription.amountMinor);
  if (orders.length !== 1) throw Object.assign(new Error('Ödenmiş abonelik dönemi doğrulanamadı.'), { code: 'PlanChangeUnavailable', statusCode: 409 });
  return { periodStart: new Date(Number(orders[0].startPeriod)), periodEnd: new Date(Number(orders[0].endPeriod)) };
}

module.exports = { proratedDifference, paidPeriod };
