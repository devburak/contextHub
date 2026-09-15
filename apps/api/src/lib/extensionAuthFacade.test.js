import { describe, expect, it } from 'vitest';

import { createExtensionAuthFacade } from './extensionAuthFacade';

const manifest = {
  name: 'semantic-search',
  permissions: ['semanticSearch.query', 'semanticSearch.configure']
};

describe('extension auth facade', () => {
  it('builds a session-only guard for manifest-declared permissions', () => {
    const auth = createExtensionAuthFacade(manifest);
    const handlers = auth.require({ permissions: 'semanticSearch.query' });

    expect(handlers).toHaveLength(4);
    expect(Object.isFrozen(handlers)).toBe(true);
  });

  it('rejects undeclared permissions and missing tenant context', () => {
    const auth = createExtensionAuthFacade(manifest);

    expect(() => auth.require({ permissions: 'tenants:manage' })).toThrowError(
      expect.objectContaining({ code: 'EXTENSION_PERMISSION_NOT_DECLARED' })
    );
    expect(() => auth.tenantId({})).toThrow('authenticated tenant context is required');
  });
});
