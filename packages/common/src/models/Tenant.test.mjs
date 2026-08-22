import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Tenant = require('./Tenant.js')

describe('Tenant quota limits', () => {
  it('preserves explicit unlimited plan limits', async () => {
    const tenant = {
      currentPlan: {
        userLimit: null,
        ownerLimit: null,
        storageLimit: null,
        monthlyRequestLimit: null,
      },
      currentUsage: {},
      getLimit: Tenant.schema.methods.getLimit,
      hasReachedLimit: Tenant.schema.methods.hasReachedLimit,
      wouldExceedLimit: Tenant.schema.methods.wouldExceedLimit,
      getRemainingQuota: Tenant.schema.methods.getRemainingQuota,
    }
    tenant.populate = async () => tenant

    await expect(tenant.getLimit('userLimit')).resolves.toBeNull()
    await expect(tenant.hasReachedLimit('userLimit')).resolves.toBe(false)
    await expect(tenant.wouldExceedLimit('userLimit', 1)).resolves.toBe(false)
    await expect(tenant.getRemainingQuota('userLimit')).resolves.toBe(Infinity)
  })

  it('returns zero only for unknown limit types', async () => {
    const tenant = { getLimit: Tenant.schema.methods.getLimit }
    await expect(tenant.getLimit('unknownLimit')).resolves.toBe(0)
  })
})
