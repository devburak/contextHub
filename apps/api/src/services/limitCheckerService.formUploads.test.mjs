import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const Media = require('@contexthub/common/src/models/Media');
const FormUpload = require('@contexthub/common/src/models/FormUpload');
const localRedisClient = require('../lib/localRedis');
const limitCheckerService = require('./limitCheckerService');
const entitlement = require('./formUploadEntitlement');

const tenantId = '64b000000000000000000001';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FORM_UPLOADS_REQUIRED_FEATURE;
});

describe('storage quota with form uploads', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(false);
    vi.spyOn(limitCheckerService, 'getTenantLimits').mockResolvedValue({ storageLimit: 1000 });
    vi.spyOn(limitCheckerService, 'getTenant').mockResolvedValue({ _id: tenantId });
    vi.spyOn(Media, 'aggregate').mockResolvedValue([{ totalSize: 600 }]);
  });

  it('counts form files together with media', async () => {
    const aggregate = vi.spyOn(FormUpload, 'aggregate').mockResolvedValue([{ totalSize: 300 }]);

    await expect(limitCheckerService.checkStorageLimit(tenantId, 100))
      .resolves.toMatchObject({ allowed: true, currentUsage: 900, remaining: 100 });
    await expect(limitCheckerService.checkStorageLimit(tenantId, 101))
      .resolves.toMatchObject({ allowed: false, currentUsage: 900 });

    const match = aggregate.mock.calls[0][0][0].$match;
    expect(match.tenantId).toBe(tenantId);
    expect(match.$or[0]).toEqual({ status: { $in: ['completed', 'attached'] } });
    expect(match.$or[1].status).toBe('pending');
    expect(match.$or[1].expiresAt.$gt).toBeInstanceOf(Date);
  });

  it('works for tenants without any form files', async () => {
    vi.spyOn(FormUpload, 'aggregate').mockResolvedValue([]);
    await expect(limitCheckerService.checkStorageLimit(tenantId, 400))
      .resolves.toMatchObject({ allowed: true, currentUsage: 600 });
  });
});

describe('form upload plan gate', () => {
  it('is open to every tenant when the deployment requires no feature', async () => {
    const loadFeatures = vi.fn(async () => []);
    await expect(entitlement.isAllowed(tenantId, { loadFeatures })).resolves.toBe(true);
    expect(loadFeatures).not.toHaveBeenCalled();
  });

  it('follows the plan feature named by the deployment', async () => {
    process.env.FORM_UPLOADS_REQUIRED_FEATURE = 'forms.file-uploads';
    await expect(entitlement.isAllowed(tenantId, { loadFeatures: async () => [] })).resolves.toBe(false);
    await expect(entitlement.isAllowed(tenantId, { loadFeatures: async () => ['semantic.search'] })).resolves.toBe(false);
    await expect(entitlement.isAllowed(tenantId, { loadFeatures: async () => ['forms.file-uploads'] })).resolves.toBe(true);
  });
});
