import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'
import { authAPI, mfaAPI } from './lib/api.js'
vi.mock('./components/Layout.jsx', () => ({ default: () => <div data-testid="authenticated-layout">Signed in</div> }))
vi.mock('./lib/api.js', () => ({
  authAPI: { session: vi.fn(), login: vi.fn() },
  mfaAPI: { challenge: vi.fn(), verify: vi.fn(), sendCode: vi.fn(), cancel: vi.fn() },
  apiClient: { defaults: { baseURL: 'https://api.example.test/api' }, get: vi.fn().mockResolvedValue({ data: { enabled: true } }) },
  setActiveTenantId: vi.fn(), setCsrfToken: vi.fn(),
}))
let root, container, client
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  authAPI.session.mockRejectedValue({ response: { status: 401 } })
  mfaAPI.challenge.mockResolvedValue({ data: { mfaRequired: true, methods: ['totp', 'email'], recoveryAvailable: true } })
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); window.history.replaceState({}, '', '/'); delete globalThis.IS_REACT_ACT_ENVIRONMENT })
describe('Google callback second-step route', () => {
  it.each(['/auth/login?mfa=1', '/login?mfa=1'])('retains the challenge marker at %s while the full session is still unauthorized', async (url) => {
    window.history.replaceState({}, '', url)
    await act(async () => root.render(<QueryClientProvider client={client}><App /></QueryClientProvider>))
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)) })
    expect(window.location.search).toBe('?mfa=1')
    expect(mfaAPI.challenge).toHaveBeenCalledOnce()
    expect(container.querySelector('#mfa-login-title')).toBeTruthy()
    expect(container.querySelector('input[autocomplete=one-time-code]')).toBeTruthy()
    expect(container.querySelector('[data-testid=authenticated-layout]')).toBeNull()
    mfaAPI.verify.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.test' }, memberships: [], activeMembership: { tenantId: 'tenant-1', role: 'owner', permissions: [] }, requiresTenantSelection: false, csrfToken: 'new-csrf' } })
    await act(async () => {
      const input = container.querySelector('input[autocomplete=one-time-code]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '123456')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mfaAPI.verify).toHaveBeenCalledWith('totp', '123456')
    expect(container.querySelector('[data-testid=authenticated-layout]')).toBeTruthy()
  })
})
