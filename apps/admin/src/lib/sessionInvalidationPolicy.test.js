import { describe, expect, it } from 'vitest'
import { shouldInvalidateSession } from './sessionInvalidationPolicy.js'

describe('shouldInvalidateSession', () => {
  it('invalidates a current-session 401', () => {
    expect(shouldInvalidateSession({
      status: 401,
      requestRevision: 2,
      currentRevision: 2,
    })).toBe(true)
  })

  it('ignores a 401 from a previous session revision', () => {
    expect(shouldInvalidateSession({
      status: 401,
      requestRevision: 1,
      currentRevision: 2,
    })).toBe(false)
  })

  it('ignores an in-flight 401 while tenant switching', () => {
    expect(shouldInvalidateSession({
      status: 401,
      requestRevision: 1,
      currentRevision: 1,
      sessionTransitioning: true,
      isSessionTransitionRequest: false,
    })).toBe(false)
  })

  it('keeps the tenant switch request 401 authoritative', () => {
    expect(shouldInvalidateSession({
      status: 401,
      requestRevision: 1,
      currentRevision: 1,
      sessionTransitioning: true,
      isSessionTransitionRequest: true,
    })).toBe(true)
  })

  it('does not treat a stale tenant mismatch as logout', () => {
    expect(shouldInvalidateSession({
      status: 403,
      errorCode: 'SessionTenantMismatch',
      requestRevision: 1,
      currentRevision: 1,
    })).toBe(false)
  })

  it('still invalidates explicitly disabled accounts', () => {
    expect(shouldInvalidateSession({
      status: 403,
      errorCode: 'AccountDisabled',
      requestRevision: 1,
      currentRevision: 1,
    })).toBe(true)
  })
})
