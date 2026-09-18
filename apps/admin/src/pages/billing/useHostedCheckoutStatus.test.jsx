import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchBillingCheckoutStatus, fetchPlanChangeStatus } from '../../lib/api/billing.js'
import { useHostedCheckoutStatus } from './useHostedCheckoutStatus.js'

vi.mock('../../lib/api/billing.js', () => ({ fetchBillingCheckoutStatus: vi.fn(), fetchPlanChangeStatus: vi.fn() }))

function Watcher({ session, tenantId = 'tenant-1', onResult }) {
  useHostedCheckoutStatus(session, tenantId, onResult)
  return null
}

describe('hosted checkout server-result watcher', () => {
  let root, container, session, onResult
  beforeEach(() => {
    vi.useFakeTimers()
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    session = { id: 'checkout-1', tenantId: 'tenant-1', expiresAt: Date.now() + 60000 }
    onResult = vi.fn()
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.resetAllMocks()
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  })

  it('waits for authenticated server completion and then stops polling', async () => {
    fetchBillingCheckoutStatus.mockResolvedValueOnce({ status: 'initialized' }).mockResolvedValue({ status: 'completed', reviewCheckout: false })
    await act(async () => root.render(<Watcher session={session} onResult={onResult} />))
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    expect(onResult).not.toHaveBeenCalled()
    // A forged iframe message cannot complete checkout.
    window.dispatchEvent(new MessageEvent('message', { data: { checkout: 'success' } }))
    expect(onResult).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(onResult).toHaveBeenCalledWith({ status: 'completed', reviewCheckout: false })
    await act(async () => vi.advanceTimersByTimeAsync(10000))
    expect(fetchBillingCheckoutStatus).toHaveBeenCalledTimes(2)
  })

  it.each(['failed', 'expired'])('reports %s without reporting success', async (status) => {
    fetchBillingCheckoutStatus.mockResolvedValue({ status })
    await act(async () => root.render(<Watcher session={session} onResult={onResult} />))
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    expect(onResult).toHaveBeenCalledOnce()
    expect(onResult).toHaveBeenCalledWith({ status })
  })

  it('retries a temporary network failure and bounds the waiting period', async () => {
    fetchBillingCheckoutStatus.mockRejectedValue(new Error('offline'))
    session.expiresAt = Date.now() + 3000
    await act(async () => root.render(<Watcher session={session} onResult={onResult} />))
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    expect(onResult).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTimeAsync(2000))
    expect(onResult).toHaveBeenCalledWith({ status: 'expired' })
  })

  it('stops after manual close and ignores an in-flight response', async () => {
    let resolve
    fetchBillingCheckoutStatus.mockImplementation(() => new Promise((done) => { resolve = done }))
    await act(async () => root.render(<Watcher session={session} onResult={onResult} />))
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    await act(async () => root.render(<Watcher session={null} onResult={onResult} />))
    await act(async () => resolve({ status: 'completed' }))
    expect(onResult).not.toHaveBeenCalled()
  })

  it('never checks the old tenant checkout under a newly selected tenant', async () => {
    await act(async () => root.render(<Watcher session={session} tenantId="tenant-2" onResult={onResult} />))
    expect(onResult).toHaveBeenCalledWith({ status: 'tenant_changed' })
    expect(fetchBillingCheckoutStatus).not.toHaveBeenCalled()
  })

  it.each(['completed', 'needs_review'])('routes an upgrade to its own status endpoint: %s', async (status) => {
    fetchPlanChangeStatus.mockResolvedValue({ status, paid: true })
    await act(async () => root.render(<Watcher session={{ ...session, kind: 'plan_change' }} onResult={onResult} />))
    await act(async () => vi.advanceTimersByTimeAsync(1500))
    expect(fetchBillingCheckoutStatus).not.toHaveBeenCalled()
    expect(onResult).toHaveBeenCalledWith({ status, paid: true, planChange: true })
    await act(async () => vi.advanceTimersByTimeAsync(5000))
    expect(fetchPlanChangeStatus).toHaveBeenCalledOnce()
  })
})
