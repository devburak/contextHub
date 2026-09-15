import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  isLegacySelfServiceTenantIndex,
  migrateLegacySelfServiceTenantIndex,
} = require('./dropLegacySelfServiceTenantIndex.js');

const legacyIndex = {
  name: 'createdBy_1_provisioningChannel_1',
  key: { createdBy: 1, provisioningChannel: 1 },
  unique: true,
  partialFilterExpression: {
    createdBy: { $type: 'objectId' },
    provisioningChannel: 'self_service',
  },
};

describe('legacy self-service tenant index migration', () => {
  it('matches only the exact retired unique partial index', () => {
    expect(isLegacySelfServiceTenantIndex(legacyIndex)).toBe(true);
    expect(isLegacySelfServiceTenantIndex({ ...legacyIndex, unique: false })).toBe(false);
    expect(isLegacySelfServiceTenantIndex({
      ...legacyIndex,
      partialFilterExpression: { provisioningChannel: 'enterprise' },
    })).toBe(false);
    expect(isLegacySelfServiceTenantIndex({
      ...legacyIndex,
      key: { createdBy: 1, provisioningChannel: 1, status: 1 },
    })).toBe(false);
  });

  it('is a non-mutating dry run by default', async () => {
    const collection = {
      indexes: vi.fn().mockResolvedValue([legacyIndex, { name: '_id_', key: { _id: 1 } }]),
      dropIndex: vi.fn(),
    };

    const result = await migrateLegacySelfServiceTenantIndex({ collection });

    expect(result).toEqual({
      apply: false,
      matchedIndexes: [legacyIndex.name],
      droppedIndexes: [],
    });
    expect(collection.dropIndex).not.toHaveBeenCalled();
  });

  it('drops every exact match when apply is enabled and remains idempotent', async () => {
    const collection = {
      indexes: vi.fn()
        .mockResolvedValueOnce([legacyIndex])
        .mockResolvedValueOnce([{ name: '_id_', key: { _id: 1 } }]),
      dropIndex: vi.fn().mockResolvedValue(undefined),
    };

    const applied = await migrateLegacySelfServiceTenantIndex({ apply: true, collection });
    const repeated = await migrateLegacySelfServiceTenantIndex({ apply: true, collection });

    expect(applied.droppedIndexes).toEqual([legacyIndex.name]);
    expect(repeated.droppedIndexes).toEqual([]);
    expect(collection.dropIndex).toHaveBeenCalledTimes(1);
    expect(collection.dropIndex).toHaveBeenCalledWith(legacyIndex.name);
  });
});
