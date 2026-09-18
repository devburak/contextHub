import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import HostedPaymentFrame from './HostedPaymentFrame.jsx'
import { iyzicoHostedCheckout } from './iyzicoHostedCheckout.js'

describe('hosted payment modal', () => {
  let root, container, onClose, onError, page
  const t = (key) => key
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div'); document.body.appendChild(container)
    root = createRoot(container)
    onClose = vi.fn(); onError = vi.fn()
    page = iyzicoHostedCheckout('https://cpp.iyzipay.com/?token=existing-session&lang=tr')
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
    vi.useRealTimers()
  })
  const render = async (props = {}) => act(async () => root.render(<HostedPaymentFrame page={page} onClose={onClose} onError={onError} t={t} language="tr" {...props} />))

  it('shows loading and a user-initiated new-tab fallback for the same payment', async () => {
    await render()
    expect(container.querySelector('[role="status"]').textContent).toContain('billing.securePayment.loading')
    const link = container.querySelector('a')
    expect(link.href).toBe(page.url)
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')
    await act(async () => container.querySelector('iframe').dispatchEvent(new Event('load')))
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows an inline slow-load warning plus notification and retries the same frame URL', async () => {
    vi.useFakeTimers()
    await render()
    const frame = container.querySelector('iframe')
    await act(async () => vi.advanceTimersByTimeAsync(15000))
    expect(container.querySelector('[role="alert"]').textContent).toContain('billing.securePayment.loadError')
    expect(onError).toHaveBeenCalledWith('billing.securePayment.loadError')
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === 'billing.action.retry')
    await act(async () => retry.click())
    expect(container.querySelector('iframe')).not.toBe(frame)
    expect(container.querySelector('iframe').src).toBe(page.frameUrl)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('uses the close handler for native dialog cancellation', async () => {
    await render()
    await act(async () => container.querySelector('dialog').dispatchEvent(new Event('cancel', { cancelable: true })))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('restores focus to the trigger when the payment modal closes', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    await render()
    await render({ page: null })
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('replaces the provider frame before rendering HTML with the stricter sandbox', async () => {
    await render()
    const providerFrame = container.querySelector('iframe')
    await render({ page: null, content: '<p>Hosted content</p>' })
    const frame = container.querySelector('iframe')
    expect(frame).not.toBe(providerFrame)
    expect(frame.hasAttribute('src')).toBe(false)
    expect(frame.getAttribute('srcdoc')).toContain('Hosted content')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(container.querySelector('a')).toBeNull()
  })
})
