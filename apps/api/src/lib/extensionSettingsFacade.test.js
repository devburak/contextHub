import { describe, expect, it, vi } from 'vitest';

import {
  ExtensionSettingsFacadeError,
  createExtensionSettingsFacade
} from './extensionSettingsFacade';

const TENANT_ID = '6a1702eddffc9f11747a4205';
const USER_ID = '69d4c1fc5bf8128438114278';

function queryResult(value) {
  return { lean: vi.fn().mockResolvedValue(value) };
}

describe('extension settings facade', () => {
  it('reads only the plugin-owned tenant namespace', async () => {
    const model = {
      findOne: vi.fn().mockReturnValue(queryResult({
        key: 'index-policy',
        value: { status: 'active' },
        revision: 2,
        createdAt: new Date('2026-08-04T00:00:00Z'),
        updatedAt: new Date('2026-08-04T01:00:00Z')
      }))
    };
    const facade = createExtensionSettingsFacade({ plugin: 'semantic-search', model });

    await expect(facade.get({ tenantId: TENANT_ID, key: 'index-policy' })).resolves.toMatchObject({
      key: 'index-policy',
      value: { status: 'active' },
      revision: 2
    });
    expect(model.findOne).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      plugin: 'semantic-search',
      key: 'index-policy'
    });
  });

  it('creates revision one and updates with optimistic concurrency', async () => {
    const model = {
      create: vi.fn().mockResolvedValue({
        key: 'index-policy',
        value: { status: 'draft' },
        revision: 1
      }),
      findOneAndUpdate: vi.fn().mockReturnValue(queryResult({
        key: 'index-policy',
        value: { status: 'active' },
        revision: 2
      }))
    };
    const facade = createExtensionSettingsFacade({ plugin: 'semantic-search', model });

    await facade.set({
      tenantId: TENANT_ID,
      key: 'index-policy',
      value: { status: 'draft' },
      expectedRevision: 0,
      updatedBy: USER_ID
    });
    await facade.set({
      tenantId: TENANT_ID,
      key: 'index-policy',
      value: { status: 'active' },
      expectedRevision: 1,
      updatedBy: USER_ID
    });

    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      plugin: 'semantic-search',
      revision: 1,
      updatedBy: USER_ID
    }));
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1 }),
      expect.objectContaining({ $inc: { revision: 1 } }),
      expect.objectContaining({ new: true, runValidators: true })
    );
  });

  it('fails closed on revision conflicts and invalid tenant scope', async () => {
    const model = {
      findOneAndUpdate: vi.fn().mockReturnValue(queryResult(null))
    };
    const facade = createExtensionSettingsFacade({ plugin: 'semantic-search', model });

    await expect(facade.set({
      tenantId: TENANT_ID,
      key: 'index-policy',
      value: {},
      expectedRevision: 4
    })).rejects.toMatchObject({ code: 'EXTENSION_SETTING_REVISION_CONFLICT' });
    await expect(facade.get({
      tenantId: 'another-tenant',
      key: 'index-policy'
    })).rejects.toBeInstanceOf(ExtensionSettingsFacadeError);
  });

  it('enumerates only tenant ids in the plugin-owned setting namespace', async () => {
    const lean = vi.fn().mockResolvedValue([
      { tenantId: '6a1702eddffc9f11747a4206' },
      { tenantId: TENANT_ID },
      { tenantId: TENANT_ID }
    ]);
    const select = vi.fn().mockReturnValue({ lean });
    const model = { find: vi.fn().mockReturnValue({ select }) };
    const facade = createExtensionSettingsFacade({ plugin: 'tenant-backup', model });

    await expect(facade.listTenantIds({ key: 'backup-plan' })).resolves.toEqual([
      TENANT_ID,
      '6a1702eddffc9f11747a4206'
    ]);
    expect(model.find).toHaveBeenCalledWith({
      plugin: 'tenant-backup',
      key: 'backup-plan'
    });
  });
});
