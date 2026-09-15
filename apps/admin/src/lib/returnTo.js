const SAFE_ORIGIN = 'https://ctxhub.invalid'
const SELF_SERVICE_PLANS = new Set(['free', 'pro', 'promax'])
const BILLING_INTERVALS = new Set(['month', 'year'])

export function safeReturnTo(value, fallback = '') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return fallback
  }

  try {
    const parsed = new URL(value, SAFE_ORIGIN)
    if (parsed.origin !== SAFE_ORIGIN) return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

export function readCheckoutIntent(search = '') {
  const params = new URLSearchParams(search)
  const planSlug = SELF_SERVICE_PLANS.has(params.get('plan')) ? params.get('plan') : ''
  const interval = BILLING_INTERVALS.has(params.get('interval')) ? params.get('interval') : 'month'
  return { planSlug, interval }
}

export function checkoutReturnTo(planSlug, interval) {
  const normalizedPlan = SELF_SERVICE_PLANS.has(planSlug) ? planSlug : 'pro'
  const normalizedInterval = BILLING_INTERVALS.has(interval) ? interval : 'month'
  return `/faturalandirma?plan=${encodeURIComponent(normalizedPlan)}&interval=${normalizedInterval}`
}

export function loginPathFor(returnTo) {
  const safePath = safeReturnTo(returnTo)
  return safePath ? `/login?returnTo=${encodeURIComponent(safePath)}` : '/login'
}

export function signupPathFor(returnTo) {
  const safePath = safeReturnTo(returnTo)
  return safePath ? `/signup?returnTo=${encodeURIComponent(safePath)}` : '/signup'
}

export function tenantCreationPathFor(returnTo) {
  const safePath = safeReturnTo(returnTo)
  const query = safePath.includes('?') ? safePath.slice(safePath.indexOf('?')) : ''
  const { planSlug, interval } = readCheckoutIntent(query)
  const params = new URLSearchParams()
  if (planSlug) params.set('plan', planSlug)
  params.set('interval', interval)
  return `/varliklar/yeni?${params.toString()}`
}
