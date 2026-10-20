import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TenantWebhooks from './TenantWebhooks.jsx'
import { tenantAPI } from '../../lib/tenantAPI.js'

const state = vi.hoisted(() => ({ tenant: 'tenant-a', selectTenant: vi.fn(), error: vi.fn() }))
vi.mock('../../contexts/AuthContext.jsx', () => ({ useAuth: () => ({ activeMembership: { tenantId: state.tenant }, selectTenant: state.selectTenant }) }))
vi.mock('../../components/TenantTabs.jsx', () => ({ default: () => null }))
vi.mock('../../contexts/ToastContext.jsx', () => ({ useToast: () => ({ success: vi.fn(), error: state.error }) }))
vi.mock('../../lib/useApiError.js', () => ({ useApiError: () => (_error, key) => key }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }), Trans: () => null }))
vi.mock('../../lib/tenantAPI.js', () => ({ tenantAPI: {
  getWebhooks: vi.fn(), getWebhookQueue: vi.fn(), getWebhookDeliveries: vi.fn(),
  beginSlackConnect: vi.fn(), completeSlackConnect: vi.fn()
} }))
let container, root, client
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  state.tenant = 'tenant-a'
  window.history.replaceState(null, '', '/varliklar/webhooks')
  window.sessionStorage.clear()
  tenantAPI.getWebhooks.mockResolvedValue({ webhooks: [], availableEventTypes: ['content.published'] })
  tenantAPI.getWebhookQueue.mockResolvedValue({ domainEvents: { items: [] }, outbox: {} })
  tenantAPI.getWebhookDeliveries.mockResolvedValue({ items: [] })
  client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  client.clear(); container.remove(); vi.clearAllMocks(); delete globalThis.IS_REACT_ACT_ENVIRONMENT
})
async function render() {
  await act(async () => {
    root.render(<QueryClientProvider client={client}><TenantWebhooks /></QueryClientProvider>)
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}
describe('webhook channel setup', () => {
  it('starts Slack authorization without requiring a webhook URL', async () => {
    tenantAPI.beginSlackConnect.mockRejectedValue(new Error('Slack not configured'))
    await render()
    const create = [...container.querySelectorAll('button')].find((item) => item.textContent === 'tenantWebhooks.create_title')
    await act(async () => create.click())
    const select = container.querySelector('#webhook-provider')
    await act(async () => { select.value = 'slack'; select.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector('#webhook-url')).toBeNull()
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(tenantAPI.beginSlackConnect).toHaveBeenCalledWith('tenant-a', { events: ['*'], payloadMode: 'event', filters: { locales: [], environments: [], collectionKeys: [] } })
  })
  it('restores the initiating tenant before completing a Slack callback', async () => {
    state.tenant = 'tenant-b'
    window.history.replaceState(null, '', '/varliklar/webhooks?code=code&state=state')
    window.sessionStorage.setItem('ctxhub-slack-oauth:state', 'tenant-a')
    state.selectTenant.mockResolvedValue(true)
    tenantAPI.completeSlackConnect.mockResolvedValue({})
    await render()
    expect(state.selectTenant).toHaveBeenCalledWith('tenant-a')
    expect(tenantAPI.completeSlackConnect).toHaveBeenCalledWith('tenant-a', { code: 'code', state: 'state' })
    expect(window.location.search).toBe('')
    expect(window.sessionStorage.getItem('ctxhub-slack-oauth:state')).toBeNull()
  })
  it('preserves the callback if the originating tenant cannot be selected', async () => {
    state.tenant = 'tenant-b'
    window.history.replaceState(null, '', '/varliklar/webhooks?code=code&state=state')
    window.sessionStorage.setItem('ctxhub-slack-oauth:state', 'tenant-a')
    state.selectTenant.mockResolvedValue(false)
    await render()
    expect(tenantAPI.completeSlackConnect).not.toHaveBeenCalled()
    expect(window.location.search).toContain('code=code')
    expect(state.error).toHaveBeenCalled()
  })
})
