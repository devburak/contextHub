import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MfaChallenge from './MfaChallenge.jsx'
import { mfaAPI } from '../lib/api.js'
vi.mock('../lib/api.js', () => ({ mfaAPI: { verify: vi.fn(), sendCode: vi.fn(), cancel: vi.fn() } }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key) => key }) }))
let container, root
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); vi.resetAllMocks() })
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete globalThis.IS_REACT_ACT_ENVIRONMENT })
const change = async (element, value) => act(async () => {
  const prototype = element.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
  element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
})
describe('second-step sign-in UI', () => {
  it('does not finish sign-in until the API verifies the chosen factor', async () => {
    const success = vi.fn(); mfaAPI.verify.mockResolvedValue({ data: { user: { id: 'verified' } } })
    await act(async () => root.render(<MfaChallenge challenge={{ methods: ['totp', 'email'], recoveryAvailable: true }} onSuccess={success} onCancel={vi.fn()} />))
    expect(success).not.toHaveBeenCalled()
    expect(container.querySelectorAll('option')).toHaveLength(3)
    await change(container.querySelector('input'), '123456')
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(mfaAPI.verify).toHaveBeenCalledWith('totp', '123456')
    expect(success).toHaveBeenCalledWith({ user: { id: 'verified' } })
  })
  it('offers email codes with resend cooldown and displays errors without logging in', async () => {
    mfaAPI.sendCode.mockResolvedValue({ data: { retryAfterSeconds: 60 } })
    mfaAPI.verify.mockRejectedValue({ response: { data: { error: 'MfaCodeInvalid' } } })
    const success = vi.fn()
    await act(async () => root.render(<MfaChallenge challenge={{ methods: ['email'], maskedEmail: 'a***@example.test' }} onSuccess={success} onCancel={vi.fn()} />))
    const send = [...container.querySelectorAll('button')].find((item) => item.textContent === 'mfa.send')
    await act(async () => send.click())
    expect(send.disabled).toBe(true)
    expect(container.querySelector('[role=status]')).toBeTruthy()
    await change(container.querySelector('input'), '123456')
    await act(async () => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.querySelector('[role=alert]').textContent).toContain('mfa.error.MfaCodeInvalid')
    expect(success).not.toHaveBeenCalled()
  })
  it('supports recovery and cancels the pending server challenge', async () => {
    mfaAPI.cancel.mockResolvedValue({ data: {} }); const cancel = vi.fn()
    await act(async () => root.render(<MfaChallenge challenge={{ methods: ['totp'], recoveryAvailable: true }} onSuccess={vi.fn()} onCancel={cancel} />))
    await change(container.querySelector('select'), 'recovery')
    expect(container.querySelector('input').maxLength).toBe(64)
    await act(async () => [...container.querySelectorAll('button')].find((item) => item.textContent === 'mfa.cancel_login').click())
    expect(mfaAPI.cancel).toHaveBeenCalledOnce(); expect(cancel).toHaveBeenCalledOnce()
  })
})
