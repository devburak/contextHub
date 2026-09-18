import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMutation, useQuery } from '@tanstack/react-query'
import { confirmPlanChange, createBillingCheckout, createBillingPortal, fetchBillingCheckoutStatus, fetchPlanChangeStatus } from '../../lib/api/billing.js'
import Billing from './Billing.jsx'

const sessionRefresh = vi.hoisted(() => vi.fn(async () => {}))

const authState = vi.hoisted(() => ({ activeTenantId: 'tenant-1' }))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { resolvedLanguage: 'tr' } }),
}))
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ hasPermission: () => true, activeTenantId: authState.activeTenantId, activeMembership: null, refreshSession: sessionRefresh }),
}))
vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('../../components/CountryCombobox.jsx', () => ({
  default: ({ value, onChange }) => <select aria-label="Country" value={value} onChange={(event) => onChange(event.target.value)}><option value="" /><option value="TR">TR</option></select>,
}))
vi.mock('../../lib/api/billing.js', () => ({
  createBillingCheckout: vi.fn(), fetchBillingCheckoutStatus: vi.fn(),
  createBillingPortal: vi.fn(), fetchBillingOverview: vi.fn(), updateBillingProfile: vi.fn(), billingInvoiceDocumentUrl: vi.fn(),
  createPlanChangeQuote: vi.fn(), confirmPlanChange: vi.fn(), fetchPlanChangeStatus: vi.fn(),
}))

function overview() {
  return {
    tenant: { id: 'tenant-1', name: 'Canary', status: 'pending_payment', requestedPlanSlug: 'pro', plan: { slug: 'free', name: 'Free' } },
    account: { name: 'Canary' },
    billingAccount: { legalName: '', country: '', address: {} },
    paymentRouting: { profileComplete: false, checkoutAvailable: false },
    subscription: null,
    plans: [{ id: 'pro-id', slug: 'pro', name: 'Pro', prices: [{ interval: 'month', amountMinor: 49900, currency: 'TRY', catalogOnly: true }], capabilities: [] }],
    charges: { subscription: { amountMinor: 49900, currency: 'TRY', interval: 'month', isEstimated: true }, usageEstimate: { available: false, lines: [] }, latestInvoice: null },
    quotaAlerts: [], usage: {}, invoices: [],
  }
}

describe('billing checkout intent', () => {
  let root
  let container
  let queryData
  let scrollIntoView
  let refetch

  beforeEach(() => {
    authState.activeTenantId = 'tenant-1'
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.history.pushState({}, '', '/faturalandirma?plan=pro&interval=month')
    window.matchMedia = vi.fn(() => ({ matches: true }))
    scrollIntoView = vi.fn()
    refetch = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    queryData = overview()
    useQuery.mockImplementation(({ queryKey }) => {
      const tr = queryKey[3] === 'TR'
      const data = {
        ...queryData,
        plans: [{ ...queryData.plans[0], prices: [{ ...queryData.plans[0].prices[0], amountMinor: tr ? 49900 : 1200, currency: tr ? 'TRY' : 'USD' }] }],
        charges: { ...queryData.charges, subscription: { ...queryData.charges.subscription, amountMinor: tr ? 49900 : 1200, currency: tr ? 'TRY' : 'USD' } },
      }
      return { data, isLoading: false, isError: false, refetch }
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    window.history.replaceState({}, '', '/')
    delete Element.prototype.scrollIntoView
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('shows USD until TR is selected and keeps the form usable through overview refreshes', async () => {
    await act(async () => root.render(<Billing />))

    expect(useQuery.mock.calls.at(-1)[0].queryKey).toContain('')
    expect(useQuery.mock.calls.at(-1)[0].refetchInterval).toBe(false)
    expect(container.textContent).toContain('$12')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    const country = container.querySelector('select[aria-label="Country"]')
    await act(async () => {
      country.value = 'TR'
      country.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useQuery.mock.calls.at(-1)[0].queryKey).toContain('TR')
    expect(container.textContent).toContain('₺499')
    expect(container.textContent).toContain('common.refresh')
    const refreshButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('common.refresh'))
    await act(async () => refreshButton.click())
    expect(refetch).toHaveBeenCalledTimes(1)

    const nameInput = container.querySelector('input[autocomplete="organization"]')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(nameInput, 'Canary Ltd')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(nameInput.value).toBe('Canary Ltd')

    queryData = overview()
    await act(async () => root.render(<Billing />))

    expect(nameInput.value).toBe('Canary Ltd')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('automatically closes the hosted payment modal and refreshes billing and entitlements', async () => {
    vi.useFakeTimers()
    fetchBillingCheckoutStatus.mockResolvedValue({ status: 'completed', reviewCheckout: false })
    await act(async () => root.render(<Billing />))
    const checkout = useMutation.mock.calls.find(([options]) => options.mutationFn === createBillingCheckout)[0]
    await act(async () => checkout.onSuccess({ checkoutContent: '<p>Secure payment</p>', checkoutSessionId: 'session-1', expiresInSeconds: 1800 }))
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.querySelector('iframe').getAttribute('sandbox')).not.toContain('allow-same-origin')
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(refetch).toHaveBeenCalledOnce()
    expect(sessionRefresh).toHaveBeenCalledOnce()
  })

  it('shows a manually managed Enterprise contract without a fictitious price or card actions', async () => {
    const data = overview()
    data.tenant = { ...data.tenant, status: 'active', plan: { slug: 'enterprise', name: 'Enterprise' } }
    data.subscription = { status: 'active', interval: 'month', amountMinor: null, currentPeriodEnd: null }
    data.billingAccount.hasProviderCustomer = false
    data.charges.subscription = { amountMinor: null, currency: 'TRY', isEstimated: false }
    useQuery.mockReturnValue({ data, isLoading: false, isError: false, refetch })
    await act(async () => root.render(<Billing />))
    expect(container.textContent).toContain('billing.status.contract')
    expect(container.textContent).toContain('billing.period.byContract')
    expect(container.textContent).toContain('billing.plans.contractPrice')
    expect(container.textContent).not.toContain('billing.period.renewal')
    expect(container.textContent).not.toContain('billing.manage.card')
    expect(container.querySelector('#billing-management')).toBeNull()
    expect(container.querySelector('#billing-charge-summary').parentElement.parentElement.parentElement.textContent).not.toContain('₺0')
    expect(createBillingPortal).not.toHaveBeenCalled()
  })

  it.each(['checkout', 'card-update'])('provides the responsive mount before the %s provider script', async (flow) => {
    await act(async () => root.render(<Billing />))
    // iyzico returns only initialization scripts, not the form container.
    const content = '<script>window.testProviderMount = document.getElementById("iyzipay-checkout-form")</script>'
    const mutationFn = flow === 'checkout' ? createBillingCheckout : createBillingPortal
    const mutation = useMutation.mock.calls.find(([options]) => options.mutationFn === mutationFn)[0]
    await act(async () => mutation.onSuccess(flow === 'checkout'
      ? { checkoutContent: content }
      : { paymentMethodContent: content }))
    const frame = container.querySelector('iframe')
    const source = frame.getAttribute('srcdoc')
    const document = new DOMParser().parseFromString(source, 'text/html')
    const mount = document.getElementById('iyzipay-checkout-form')
    expect(mount).not.toBeNull()
    expect(mount.className).toBe('responsive')
    expect(source.indexOf('<div')).toBeLessThan(source.indexOf('<script>'))
    expect(document.querySelector('meta[name="viewport"]').content).toContain('width=device-width')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts')
    expect(container.querySelector('script')).toBeNull()
  })

  it('opens management choices without opening the card form', async () => {
    queryData.tenant.status = 'active'; queryData.tenant.plan = { slug: 'pro', name: 'Pro' }
    queryData.billingAccount.hasProviderCustomer = true
    queryData.subscription = { status: 'active', interval: 'month' }
    await act(async () => root.render(<Billing />))
    const buttons = [...container.querySelectorAll('button')]
    const index = useMutation.mock.calls.findIndex(([options]) => options.mutationFn === createBillingPortal)
    const mutate = useMutation.mock.results[index].value.mutate
    await act(async () => buttons.find((button) => button.textContent.includes('billing.portal.manage')).click())
    expect(container.querySelector('#billing-management')).not.toBeNull()
    expect(mutate).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalled()
    expect(buttons.some((button) => button.textContent.includes('billing.manage.card'))).toBe(true)
    expect(buttons.some((button) => button.textContent.includes('billing.change.enterpriseTitle'))).toBe(true)
  })

  function pendingChange() {
    queryData.tenant.status = 'active'
    queryData.tenant.plan = { slug: 'pro', name: 'Pro' }
    queryData.subscription = { status: 'active', interval: 'month' }
    queryData.planChange = { id: 'change-1', tenantId: 'tenant-1', status: 'awaiting_payment' }
    return {
      change: queryData.planChange,
      checkoutUrl: 'https://cpp.iyzipay.com/?token=existing-session&lang=tr',
      checkoutContent: '<script>window.providerUsesStorage = true</script>',
      expiresInSeconds: 900,
    }
  }

  async function resumeChange() {
    await act(async () => root.render(<Billing />))
    const resume = [...container.querySelectorAll('button')].find((button) => button.textContent === 'billing.change.resume')
    await act(async () => resume.click())
  }

  it('embeds the same plan-change payment without navigating or granting srcDoc storage access', async () => {
    vi.useFakeTimers()
    const result = pendingChange()
    confirmPlanChange.mockResolvedValue(result)
    await resumeChange()
    expect(confirmPlanChange).toHaveBeenCalledTimes(1)
    expect(confirmPlanChange).toHaveBeenCalledWith('change-1')
    const frame = container.querySelector('iframe')
    expect(frame.getAttribute('src')).toBe(`${result.checkoutUrl}&iframe=true`)
    expect(frame.hasAttribute('srcdoc')).toBe(false)
    expect(frame.getAttribute('sandbox')).toContain('allow-same-origin')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation')
    expect(window.location.pathname).toBe('/faturalandirma')
    expect(fetchPlanChangeStatus).not.toHaveBeenCalled()
    expect(createBillingCheckout).not.toHaveBeenCalled()
    expect(sessionRefresh).not.toHaveBeenCalled()
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('keeps the error and existing-payment retry visible if the hosted URL is rejected', async () => {
    confirmPlanChange.mockResolvedValue({ ...pendingChange(), checkoutUrl: 'https://evil.test/pay' })
    await resumeChange()
    expect(container.querySelector('[role="alert"]').textContent).toContain('billing.change.error')
    expect(container.textContent).toContain('billing.change.resume')
    expect(container.querySelector('iframe')).toBeNull()
    expect(createBillingCheckout).not.toHaveBeenCalled()
  })

  it('does not navigate to a plan-change payment returned for another tenant', async () => {
    const result = pendingChange()
    confirmPlanChange.mockResolvedValue({ ...result, change: { ...result.change, tenantId: 'tenant-2' } })
    await resumeChange()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it('retains sandbox isolation for legacy HTML-only plan-change responses', async () => {
    vi.useFakeTimers()
    const result = pendingChange()
    confirmPlanChange.mockResolvedValue({ ...result, checkoutUrl: null })
    await resumeChange()
    const frame = container.querySelector('iframe')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('srcdoc')).toContain('iyzipay-checkout-form')
  })

  it('closes the provider iframe only after the server verifies completion, not on frame load or messages', async () => {
    vi.useFakeTimers()
    confirmPlanChange.mockResolvedValue(pendingChange())
    fetchPlanChangeStatus.mockResolvedValueOnce({ status: 'awaiting_payment' }).mockResolvedValueOnce({ status: 'completed' })
    await resumeChange()
    await act(async () => {
      container.querySelector('iframe').dispatchEvent(new Event('load'))
      window.dispatchEvent(new MessageEvent('message', { origin: 'https://cpp.iyzipay.com', data: { status: 'completed' } }))
      await vi.advanceTimersByTimeAsync(1500)
    })
    expect(container.querySelector('iframe')).not.toBeNull()
    expect(sessionRefresh).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(fetchPlanChangeStatus).toHaveBeenCalledWith('change-1')
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(sessionRefresh).toHaveBeenCalledOnce()
    expect(createBillingCheckout).not.toHaveBeenCalled()
  })

  it('closes the hosted iframe and stops checking payment status when the user switches tenants', async () => {
    vi.useFakeTimers()
    confirmPlanChange.mockResolvedValue(pendingChange())
    await resumeChange()
    expect(container.querySelector('iframe')).not.toBeNull()
    authState.activeTenantId = 'tenant-2'
    await act(async () => root.render(<Billing />))
    expect(container.querySelector('iframe')).toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(4000))
    expect(fetchPlanChangeStatus).not.toHaveBeenCalled()
  })

  it('closing the modal stops polling without canceling or creating a payment', async () => {
    vi.useFakeTimers()
    confirmPlanChange.mockResolvedValue(pendingChange())
    await resumeChange()
    await act(async () => container.querySelector('[aria-label="billing.securePayment.close"]').click())
    expect(container.querySelector('iframe')).toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(4000))
    expect(fetchPlanChangeStatus).not.toHaveBeenCalled()
    expect(confirmPlanChange).toHaveBeenCalledTimes(1)
    expect(createBillingCheckout).not.toHaveBeenCalled()
  })
})
