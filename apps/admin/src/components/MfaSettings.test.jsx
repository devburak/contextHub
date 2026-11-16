import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MfaSettings, { MfaReminder } from './MfaSettings.jsx'
import { mfaAPI } from '../lib/api.js'
import { useAuth } from '../contexts/AuthContext.jsx'
vi.mock('../lib/api.js', () => ({ mfaAPI: { settings: vi.fn(), enroll: vi.fn(), confirm: vi.fn(), change: vi.fn(), snooze: vi.fn() } }))
vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,test') } }))
const t = (key) => key
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t }) }))
let container, root, client, auth
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container)
  client = new QueryClient({ defaultOptions: { queries: { retry: false, cacheTime: 0 } } })
  vi.clearAllMocks()
  auth = { user: { id: 'user-1' }, memberships: [{ role: 'owner', status: 'active' }], login: vi.fn(), logout: vi.fn().mockResolvedValue() }
  useAuth.mockReturnValue(auth)
  mfaAPI.settings.mockResolvedValue({ data: { available: true, enabled: false, methods: [] } })
})
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT })
async function render(component) {
  await act(async () => { root.render(<QueryClientProvider client={client}><MemoryRouter>{component}</MemoryRouter></QueryClientProvider>) })
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
}
const button = (key) => [...container.querySelectorAll('button')].find((item) => item.textContent === key)
async function change(element, value) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })) })
}
describe('optional MFA setup and transition', () => {
  it('shows the QR/manual key and waits for confirmation before saving codes or changing the session', async () => {
    mfaAPI.enroll.mockResolvedValue({ data: { method: 'totp', secret: 'MANUAL-KEY', uri: 'otpauth://totp/test', challengeToken: 'pending-token' } })
    mfaAPI.confirm.mockResolvedValue({ data: { user: { id: 'user-1' }, recoveryCodes: ['one-time-recovery-code'] } })
    await render(<MfaSettings />)
    await change(container.querySelector('input[type=password]'), 'current-password')
    await act(async () => button('mfa.setup').click())
    expect(mfaAPI.enroll).toHaveBeenCalledWith('totp', 'current-password')
    expect(container.querySelector('img').src).toContain('data:image/png')
    expect(container.querySelector('code').textContent).toBe('MANUAL-KEY')
    expect(auth.login).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain('one-time-recovery-code')
    await change(container.querySelector('input[autocomplete=one-time-code]'), '123456')
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mfaAPI.confirm).toHaveBeenCalledWith({ method: 'totp', challengeToken: 'pending-token', code: '123456' })
    expect(auth.login).toHaveBeenCalledOnce()
    expect(container.textContent).toContain('one-time-recovery-code')
    expect(container.querySelector('a[download]').getAttribute('href')).toContain('one-time-recovery-code')
    await act(async () => button('mfa.saved').click())
    expect(container.textContent).not.toContain('one-time-recovery-code')
  })
  it('asks for a recent factor sign-in before exposing sensitive settings actions', async () => {
    mfaAPI.settings.mockResolvedValue({ data: { available: true, enabled: true, methods: ['totp'], requiresMfaReauthentication: true } })
    await render(<MfaSettings />)
    expect(button('mfa.reauth')).toBeTruthy()
    expect(button('mfa.disable')).toBeUndefined()
    expect(mfaAPI.enroll).not.toHaveBeenCalled()
  })
  it('requires an explicit confirmation before disabling the factor', async () => {
    mfaAPI.settings.mockResolvedValue({ data: { available: true, enabled: true, methods: ['totp', 'email'], recoveryCodesRemaining: 8 } })
    mfaAPI.change.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    await render(<MfaSettings />)
    await change(container.querySelector('input[type=password]'), 'current-password')
    await act(async () => button('mfa.disable').click())
    expect(mfaAPI.change).not.toHaveBeenCalled()
    await act(async () => button('mfa.confirm').click())
    expect(mfaAPI.change).toHaveBeenCalledWith('disable', 'current-password')
    expect(auth.login).toHaveBeenCalledOnce()
  })
  it('lets existing owner/admin accounts postpone the optional reminder', async () => {
    mfaAPI.snooze.mockResolvedValue({ data: {} })
    await render(<MfaReminder />)
    expect(container.querySelector('a').getAttribute('href')).toBe('/profile#two-factor')
    mfaAPI.settings.mockResolvedValue({ data: { available: true, enabled: false, methods: [], reminderAfter: new Date(Date.now() + 86400000).toISOString() } })
    await act(async () => button('mfa.later').click())
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)) })
    expect(mfaAPI.snooze).toHaveBeenCalledOnce()
    expect(container.querySelector('aside')).toBeNull()
    expect(auth.logout).not.toHaveBeenCalled()
  })
  it('does not show a reminder for other roles', async () => {
    auth.memberships = [{ role: 'viewer', status: 'active' }]
    await render(<MfaReminder />)
    expect(mfaAPI.settings).not.toHaveBeenCalled()
    expect(container.querySelector('aside')).toBeNull()
  })
})
