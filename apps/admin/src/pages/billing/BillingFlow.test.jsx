import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createBillingCheckout, createBillingPortal, fetchBillingCheckoutStatus } from '../../lib/api/billing.js'
import Billing from './Billing.jsx'

const sessionRefresh = vi.hoisted(() => vi.fn(async () => {}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { resolvedLanguage: 'tr' } }),
}))
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ hasPermission: () => true, activeTenantId: 'tenant-1', activeMembership: null, refreshSession: sessionRefresh }),
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
})
