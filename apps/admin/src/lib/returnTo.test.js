import { describe, expect, it } from 'vitest'
import {
  checkoutReturnTo,
  loginPathFor,
  readCheckoutIntent,
  safeReturnTo,
  signupPathFor,
  tenantCreationPathFor,
} from './returnTo.js'

describe('checkout return navigation', () => {
  it('keeps a validated plan and interval through login and signup', () => {
    const returnTo = checkoutReturnTo('promax', 'year')

    expect(returnTo).toBe('/faturalandirma?plan=promax&interval=year')
    expect(loginPathFor(returnTo)).toContain(encodeURIComponent(returnTo))
    expect(signupPathFor(returnTo)).toContain(encodeURIComponent(returnTo))
    expect(tenantCreationPathFor(returnTo)).toBe('/varliklar/yeni?plan=promax&interval=year')
  })

  it('rejects external redirects and unknown catalog values', () => {
    expect(safeReturnTo('//evil.example/path')).toBe('')
    expect(safeReturnTo('https://evil.example/path')).toBe('')
    expect(readCheckoutIntent('?plan=enterprise&interval=weekly')).toEqual({
      planSlug: '',
      interval: 'month',
    })
  })
})
