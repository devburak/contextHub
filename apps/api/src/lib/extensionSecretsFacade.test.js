import { describe, expect, it, vi } from 'vitest';

import {
  ExtensionSecretsFacadeError,
  createExtensionSecretsFacade,
  createSecretCodec
} from './extensionSecretsFacade';

const TENANT_ID = '6a1702eddffc9f11747a4205';
const OTHER_TENANT_ID = '6a1702eddffc9f11747a4206';
const MASTER_KEY = 'test-extension-secret-key-that-is-longer-than-32-bytes';

function selectedResult(value) {
  const lean = vi.fn().mockResolvedValue(value);
  return { select: vi.fn().mockReturnValue({ lean }) };
}

describe('extension secrets facade', () => {
  it('binds ciphertext to tenant, plugin and key with authenticated encryption', () => {
    const codec = createSecretCodec(MASTER_KEY);
    const identity = { tenantId: TENANT_ID, plugin: 'tenant-backup', key: 's3-credentials' };
    const ciphertext = codec.encrypt({ accessKeyId: 'id', secretAccessKey: 'secret' }, identity);

    expect(codec.decrypt(ciphertext, identity)).toEqual({
      accessKeyId: 'id',
      secretAccessKey: 'secret'
    });
    expect(() => codec.decrypt(ciphertext, { ...identity, tenantId: OTHER_TENANT_ID }))
      .toThrowError(expect.objectContaining({ code: 'EXTENSION_SECRET_DECRYPT_FAILED' }));
  });

  it('queries only the plugin-owned tenant namespace and never returns ciphertext metadata', async () => {
    const codec = createSecretCodec(MASTER_KEY);
    const identity = { tenantId: TENANT_ID, plugin: 'tenant-backup', key: 's3-credentials' };
    const ciphertext = codec.encrypt({ secretAccessKey: 'secret' }, identity);
    const result = selectedResult({ ciphertext, revision: 3, updatedAt: new Date() });
    const model = { findOne: vi.fn().mockReturnValue(result) };
    const facade = createExtensionSecretsFacade({ plugin: 'tenant-backup', model, codec });

    await expect(facade.get({ tenantId: TENANT_ID, key: 's3-credentials' })).resolves.toMatchObject({
      value: { secretAccessKey: 'secret' },
      revision: 3
    });
    expect(model.findOne).toHaveBeenCalledWith(identity);
    expect(result.select).toHaveBeenCalledWith('+ciphertext');
    await expect(facade.get({ tenantId: 'other', key: 's3-credentials' }))
      .rejects.toBeInstanceOf(ExtensionSecretsFacadeError);
  });
});
