import { describe, expect, it, vi } from 'vitest'
import { redirectToIyzicoCheckout } from './iyzicoHostedCheckout.js'

describe('iyzico hosted checkout redirect', () => {
  it.each(['cpp.iyzipay.com', 'sandbox-cpp.iyzipay.com'])('preserves the existing token and query on %s', (host) => {
    const navigate = vi.fn()
    const url = `https://${host}/?token=existing-session&lang=tr`
    redirectToIyzicoCheckout(url, navigate)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(url)
  })

  it.each([
    'javascript:alert(1)',
    'http://cpp.iyzipay.com/?token=existing-session',
    '//cpp.iyzipay.com/?token=existing-session',
    'https://cpp.iyzipay.com.evil.test/?token=existing-session',
    'https://evil.test/?next=https://cpp.iyzipay.com',
    'https://cpp.iyzipay.com@evil.test/',
    'https://user:password@cpp.iyzipay.com/',
    'https://cpp.iyzipay.com:8443/',
    '',
    null,
  ])('rejects an unsafe or missing destination without navigating: %s', (url) => {
    const navigate = vi.fn()
    expect(() => redirectToIyzicoCheckout(url, navigate)).toThrow('Invalid hosted checkout URL')
    expect(navigate).not.toHaveBeenCalled()
  })
})
