const CHECKOUT_ORIGINS = new Set([
  'https://cpp.iyzipay.com',
  'https://sandbox-cpp.iyzipay.com',
])

export function redirectToIyzicoCheckout(value, navigate = (url) => window.location.assign(url)) {
  let url
  try { url = new URL(value) } catch { throw new Error('Invalid hosted checkout URL') }
  if (!CHECKOUT_ORIGINS.has(url.origin) || url.username || url.password) {
    throw new Error('Invalid hosted checkout URL')
  }
  // Reuse the exact provider URL/token. Never initialize another payment here.
  navigate(value)
}
