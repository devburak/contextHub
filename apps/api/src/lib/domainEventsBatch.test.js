import { describe, it, expect, vi } from 'vitest'

import { __testables } from './domainEventsBatch'

const { buildTenantMatchValues } = __testables

describe('buildTenantMatchValues', () => {
  it('returns raw tenant string when not ObjectId-compatible', async () => {
    const result = await buildTenantMatchValues('tenant_slug')
    expect(result).toEqual(['tenant_slug'])
  })

  it('matches ID representations without expanding to slug aliases', async () => {
    const value = '64d2f6f6a1c9a4b5c6d7e8f9'
    const lookup = vi.fn().mockResolvedValue('tenant-slug')
    const result = await buildTenantMatchValues(value, { findTenantSlug: lookup })

    expect(lookup).not.toHaveBeenCalled()
    expect(result).toHaveLength(2)
    expect(result).not.toContain('tenant-slug')
    expect(result).toContain(value)
    expect(result.some((item) => typeof item !== 'string')).toBe(true)
  })

  it('matches nothing when tenant id is missing', async () => {
    const result = await buildTenantMatchValues(null)
    expect(result).toEqual([])
  })
})
