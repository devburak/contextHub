const CHECKOUT_ORIGINS = new Set([
  'https://cpp.iyzipay.com',
  'https://sandbox-cpp.iyzipay.com',
])

export function iyzicoHostedCheckout(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('Invalid hosted checkout URL') }
  if (url.protocol !== 'https:' || !CHECKOUT_ORIGINS.has(url.origin) || url.username || url.password) {
    throw new Error('Invalid hosted checkout URL')
  }
  // Enable iyzico's documented iframe mode on the existing payment session.
  // This URL is not srcDoc: provider scripts keep their own origin/storage.
  url.searchParams.set('iframe', 'true')
  return { url: value, frameUrl: url.toString() }
}
