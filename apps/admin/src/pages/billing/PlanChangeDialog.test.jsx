import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPlanChangeQuote, confirmPlanChange } from '../../lib/api/billing.js'
import PlanChangeDialog from './PlanChangeDialog.jsx'
import tr from '../../locales/tr/billing.json'
vi.mock('../../lib/api/billing.js', () => ({ createPlanChangeQuote: vi.fn(), confirmPlanChange: vi.fn() }))

describe('plan-change consent dialog', () => {
  let root, container, props, quote
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-16T00:00:00Z'))
    HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
    HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
    props = { selection: { priceId: 'price-max' }, tenantId: 'tenant-1', canManage: true, online: true,
      t: (key, values = {}) => Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{{${name}}}`, value), tr[key] || key),
      locale: 'tr-TR', onClose: vi.fn(), onCheckout: vi.fn(), onError: vi.fn() }
    quote = { id: 'quote-1', tenantId: 'tenant-1', fromPlanName: 'Pro', toPlanName: 'Pro Max', amountMinor: 50000,
      recurringAmountMinor: 149900, currency: 'TRY', interval: 'month', renewalAt: '2026-10-01T00:00:00Z', quoteExpiresAt: new Date(Date.now() + 300000).toISOString() }
    createPlanChangeQuote.mockResolvedValue(quote)
    confirmPlanChange.mockResolvedValue({ change: quote, checkoutContent: '<p>checkout</p>' })
  })
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); vi.useRealTimers(); delete globalThis.IS_REACT_ACT_ENVIRONMENT })
  const pay = () => [...container.querySelectorAll('button')].find((button) => button.textContent === tr['billing.change.confirm'])
  it('separates one-off, recurring and renewal figures and requires explicit consent', async () => {
    await act(async () => root.render(<PlanChangeDialog {...props} />))
    expect(container.querySelector('dialog[open]')).not.toBeNull()
    expect(container.textContent).toContain('₺500,00')
    expect(container.textContent).toContain('₺1.499,00')
    expect(container.textContent).toContain('1 Eki 2026')
    expect(pay().disabled).toBe(true)
    expect(confirmPlanChange).not.toHaveBeenCalled()
    await act(async () => container.querySelector('input[type="checkbox"]').click())
    await act(async () => pay().click())
    expect(confirmPlanChange).toHaveBeenCalledWith('quote-1')
    expect(props.onCheckout).toHaveBeenCalledOnce()
  })
  it('expires the quote and requires recalculation before payment', async () => {
    await act(async () => root.render(<PlanChangeDialog {...props} />))
    await act(async () => container.querySelector('input').click())
    await act(async () => vi.advanceTimersByTimeAsync(301000))
    expect(pay().disabled).toBe(true)
    expect(container.textContent).toContain(tr['billing.change.expired'])
    expect(confirmPlanChange).not.toHaveBeenCalled()
  })
  it('shows an inline error, toast and a working retry without taking payment', async () => {
    createPlanChangeQuote.mockRejectedValueOnce(new Error('offline'))
    await act(async () => root.render(<PlanChangeDialog {...props} />))
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(props.onError).toHaveBeenCalledOnce()
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === tr['billing.change.recalculate'])
    await act(async () => retry.click())
    expect(createPlanChangeQuote).toHaveBeenCalledTimes(2)
    expect(confirmPlanChange).not.toHaveBeenCalled()
  })
  it.each([{ online: false }, { canManage: false }])('does not request a quote when unavailable: %j', async (override) => {
    await act(async () => root.render(<PlanChangeDialog {...props} {...override} />))
    expect(createPlanChangeQuote).not.toHaveBeenCalled()
    expect(pay().disabled).toBe(true)
  })
  it('explains that an Enterprise request is not an automatic plan change or charge', async () => {
    await act(async () => root.render(<PlanChangeDialog {...props} selection={{ enterprise: true, tenantName: 'Sample' }} />))
    expect(container.querySelector('a').href).toContain('mailto:support@ctxhub.net')
    expect(container.textContent).toContain(tr['billing.change.enterpriseDescription'])
    expect(createPlanChangeQuote).not.toHaveBeenCalled()
  })
});
