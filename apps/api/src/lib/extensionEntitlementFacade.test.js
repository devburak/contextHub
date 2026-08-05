import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
import entitlementModule from './extensionEntitlementFacade';

const require = createRequire(import.meta.url);
const { Tenant } = require('@contexthub/common');

const {
  ExtensionEntitlementFacadeError,
  createExtensionEntitlementFacade,
} = entitlementModule;

const manifest = {
  name: 'semantic-search',
  featureKeys: ['search.semantic', 'content.related'],
};

describe('extension entitlement facade', () => {
  it('uses the referenced paid plan when the legacy plan string is stale', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue({
        plan: 'free',
        currentPlan: {
          slug: 'enterprise',
          features: ['search.semantic', 'content.related'],
        },
      }),
    };
    vi.spyOn(Tenant, 'findById').mockReturnValue(query);
    const facade = createExtensionEntitlementFacade(manifest);

    await expect(facade.has(
      { tenantId: 'tenant-1' },
      ['search.semantic', 'content.related']
    )).resolves.toBe(true);

    expect(query.select).toHaveBeenCalledWith('plan currentPlan');
    expect(query.populate).toHaveBeenCalledWith('currentPlan');
  });

  it('allows an entitled tenant and denies a missing feature', async () => {
    const facade = createExtensionEntitlementFacade(manifest, {
      loadTenantFeatures: async () => ['search.semantic'],
    });
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };

    await expect(facade.require({ features: 'search.semantic' })({ tenantId: 'tenant-1' }, reply))
      .resolves.toBeUndefined();
    await facade.require({ features: 'content.related' })({ tenantId: 'tenant-1' }, reply);

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'FeatureNotEntitled' }));
  });

  it('fails fast for undeclared features and invalid modes', () => {
    const facade = createExtensionEntitlementFacade(manifest, {
      loadTenantFeatures: async () => [],
    });
    expect(() => facade.require({ features: 'billing.secret' }))
      .toThrow(ExtensionEntitlementFacadeError);
    expect(() => facade.require({ features: 'search.semantic', mode: 'none' }))
      .toThrow('feature mode must be all or any');
  });
});
