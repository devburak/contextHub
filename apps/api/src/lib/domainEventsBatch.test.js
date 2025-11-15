import { describe, it, expect, vi } from 'vitest'

import { __testables } from './domainEventsBatch'

const { buildTenantMatchValues } = __testables

describe('buildTenantMatchValues', () => {
  it('returns raw tenant string when not ObjectId-compatible', async () => {
    const result = await buildTenantMatchValues('tenant_slug')
    expect(result).toEqual(['tenant_slug'])
  })

  it('adds ObjectId and slug variants for hex ids', async () => {
    const value = '64d2f6f6a1c9a4b5c6d7e8f9'
    const lookup = vi.fn().mockResolvedValue('tenant-slug')
    const result = await buildTenantMatchValues(value, { findTenantSlug: lookup })

    expect(lookup).toHaveBeenCalledWith(value)
    expect(result).toEqual(expect.arrayContaining(['tenant-slug', value]))
    expect(result.some((item) => typeof item !== 'string')).toBe(true)
  })

  it('falls back to [null] when tenant id missing', async () => {
    const result = await buildTenantMatchValues(null)
    expect(result).toEqual([null])
  })
})
