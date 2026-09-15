import { describe, expect, it } from 'vitest'
import { isHostedDeployment } from './hostedDeployment.js'

describe('hosted deployment boundary', () => {
  it('fails closed unless the hosted build flag is explicit', () => {
    expect(isHostedDeployment({})).toBe(false)
    expect(isHostedDeployment({ VITE_CTXHUB_HOSTED: 'false' })).toBe(false)
    expect(isHostedDeployment({ VITE_CTXHUB_HOSTED: 'true' })).toBe(true)
  })
})
