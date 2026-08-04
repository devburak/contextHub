import { describe, expect, it, vi } from 'vitest'

import { runConsumerBatch, tenantIdentity } from './domainEventConsumerProcess'

describe('domain event consumer process', () => {
  it('runs every registered consumer partition through the runner for each tenant', async () => {
    const runTenant = vi.fn(async (tenantId) => [
      { consumer: 'dummy-consumer', tenantId, status: 'processed' }
    ])
    const logger = { info: vi.fn() }

    const result = await runConsumerBatch({
      tenants: [{ _id: 'tenant-1', slug: 'first' }, { id: 'tenant-2' }],
      runner: { runTenant },
      logger
    })

    expect(runTenant).toHaveBeenNthCalledWith(1, 'tenant-1')
    expect(runTenant).toHaveBeenNthCalledWith(2, 'tenant-2')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ tenantId: 'tenant-1', slug: 'first' })
  })

  it('rejects tenant records without an identity', () => {
    expect(() => tenantIdentity({ slug: 'missing-id' })).toThrow(
      'tenant without an id'
    )
  })
})
