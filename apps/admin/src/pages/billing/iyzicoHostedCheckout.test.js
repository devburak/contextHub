import { describe, expect, it } from 'vitest'
import { iyzicoHostedCheckout } from './iyzicoHostedCheckout.js'

describe('iyzico hosted checkout iframe', () => {
  it.each(['cpp.iyzipay.com', 'sandbox-cpp.iyzipay.com'])('preserves the existing token and query on %s', (host) => {
    const url = `https://${host}/?token=existing-session&lang=tr`
    const result = iyzicoHostedCheckout(url)
    expect(result.url).toBe(url)
    expect(result.frameUrl).toBe(`${url}&iframe=true`)
  })

  it('replaces duplicate iframe parameters without changing the payment token', () => {
    const result = iyzicoHostedCheckout('https://cpp.iyzipay.com/?token=existing%2Bsession&iframe=false&iframe=0&lang=en')
    const url = new URL(result.frameUrl)
    expect(url.searchParams.getAll('iframe')).toEqual(['true'])
    expect(url.searchParams.get('token')).toBe('existing+session')
    expect(url.searchParams.get('lang')).toBe('en')
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
    'https://ctxhub.net/faturalandirma',
    'data:text/html,<script>alert(1)</script>',
    'blob:https://cpp.iyzipay.com/not-a-checkout',
    '',
    null,
  ])('rejects an unsafe or missing destination without navigating: %s', (url) => {
    expect(() => iyzicoHostedCheckout(url)).toThrow('Invalid hosted checkout URL')
  })
})
