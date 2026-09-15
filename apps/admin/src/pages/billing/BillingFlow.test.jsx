import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuery } from '@tanstack/react-query'
import Billing from './Billing.jsx'

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => key, i18n: { resolvedLanguage: 'tr' } }),
}))
vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({ hasPermission: () => true, activeTenantId: 'tenant-1', activeMembership: null }),
}))
vi.mock('../../contexts/ToastContext.jsx', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))
vi.mock('../../components/CountryCombobox.jsx', () => ({
  default: ({ value, onChange }) => <select aria-label="Country" value={value} onChange={(event) => onChange(event.target.value)}><option value="" /><option value="TR">TR</option></select>,
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

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    window.history.pushState({}, '', '/faturalandirma?plan=pro&interval=month')
    window.matchMedia = vi.fn(() => ({ matches: true }))
    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    queryData = overview()
    useQuery.mockImplementation(({ queryKey }) => {
      const tr = queryKey[3] === 'TR'
      const data = {
        ...queryData,
        plans: [{ ...queryData.plans[0], prices: [{ ...queryData.plans[0].prices[0], amountMinor: tr ? 49900 : 1200, currency: tr ? 'TRY' : 'USD' }] }],
        charges: { ...queryData.charges, subscription: { ...queryData.charges.subscription, amountMinor: tr ? 49900 : 1200, currency: tr ? 'TRY' : 'USD' } },
      }
      return { data, isLoading: false, isError: false, refetch: vi.fn() }
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
  })

  it('shows USD until TR is selected and keeps the form usable through overview refreshes', async () => {
    await act(async () => root.render(<Billing />))

    expect(useQuery.mock.calls.at(-1)[0].queryKey).toContain('')
    expect(container.textContent).toContain('$12')
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    const country = container.querySelector('select[aria-label="Country"]')
    await act(async () => {
      country.value = 'TR'
      country.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(useQuery.mock.calls.at(-1)[0].queryKey).toContain('TR')
    expect(container.textContent).toContain('₺499')

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
})
