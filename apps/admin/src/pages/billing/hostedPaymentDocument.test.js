import { describe, expect, it } from 'vitest'
import { hostedPaymentDocument } from './hostedPaymentDocument.js'

describe('hosted payment document', () => {
  it('wraps script-only provider responses without modifying the script', () => {
    const fragment = '<script>var iyziInit = {token: "fixture-token"};</script>'
    const html = hostedPaymentDocument(fragment)
    const document = new DOMParser().parseFromString(html, 'text/html')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain(fragment)
    expect(document.querySelectorAll('#iyzipay-checkout-form')).toHaveLength(1)
    expect(document.body.firstElementChild.id).toBe('iyzipay-checkout-form')
    expect(document.body.lastElementChild.tagName).toBe('SCRIPT')
    expect(document.querySelector('meta[charset]').getAttribute('charset')).toBe('utf-8')
  })

  it.each([['en', 'en'], ['tr', 'tr'], ['<script>bad</script>', 'tr']])('uses a fixed safe language for %s', (language, expected) => {
    const document = new DOMParser().parseFromString(hostedPaymentDocument('', language), 'text/html')
    expect(document.documentElement.lang).toBe(expected)
    expect(document.querySelectorAll('script')).toHaveLength(0)
  })
})
