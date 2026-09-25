import { afterEach, describe, expect, it, vi } from 'vitest';
import indexManagement from './indexManagement.js';
import deploymentIndexes from './deploymentIndexes.js';
import models from './models/index.js';

const { ensureModelIndexes, ensureDeploymentIndexes } = indexManagement;

function modelWithIndexes(initial = []) {
  let indexes = initial.map((index) => ({ ...index }));
  const model = {
    modelName: 'Example',
    collection: {
      listIndexes: vi.fn(() => ({ toArray: async () => indexes })),
      createIndex: vi.fn(async (key, options = {}) => {
        indexes = [...indexes, { name: JSON.stringify(key), key, ...options }];
      }),
      dropIndex: vi.fn(),
      dropIndexes: vi.fn(),
    },
  };
  return model;
}

afterEach(() => vi.restoreAllMocks());

describe('additive index management', () => {
  it('creates missing indexes, verifies them and does no work on subsequent runs', async () => {
    const legacy = { name: 'legacy', key: { tenantId: 1, publishAt: 1 } };
    const model = modelWithIndexes([legacy]);
    const definitions = deploymentIndexes.Content.map((key) => [key, {}]);
    await ensureModelIndexes(model, definitions);
    await ensureModelIndexes(model, definitions);
    expect(model.collection.createIndex).toHaveBeenCalledTimes(deploymentIndexes.Content.length);
    expect(await model.collection.listIndexes().toArray()).toContainEqual(legacy);
    expect(model.collection.dropIndex).not.toHaveBeenCalled();
    expect(model.collection.dropIndexes).not.toHaveBeenCalled();
  });

  it('accepts equivalent keys and options under an existing different name', async () => {
    const key = deploymentIndexes.Content[0];
    const model = modelWithIndexes([{ key, name: 'existing_manual_name', unique: false }]);
    await ensureModelIndexes(model, [[key, { name: 'new_schema_name', background: true }]]);
    expect(model.collection.createIndex).not.toHaveBeenCalled();
  });

  it('requires the exact compound key order', async () => {
    const key = deploymentIndexes.Content[0];
    const model = modelWithIndexes([{ name: 'wrong_order', key: { status: 1, tenantId: 1, publishedAt: -1, _id: -1 } }]);
    await ensureModelIndexes(model, [[key, {}]]);
    expect(model.collection.createIndex).toHaveBeenCalledWith(key, {});
  });

  it.each([
    { sparse: true },
    { unique: true },
    { hidden: true },
    { partialFilterExpression: { status: 'published' } },
    { expireAfterSeconds: 60 },
    { collation: { locale: 'tr' } },
  ])('does not accept an index with incompatible options: %j', async (options) => {
    const key = deploymentIndexes.Content[0];
    const model = modelWithIndexes([{ key, name: 'incompatible', ...options }]);
    model.collection.createIndex.mockResolvedValue('incompatible');
    await expect(ensureModelIndexes(model, [[key, {}]])).rejects.toThrow('Index verification failed');
    expect(model.collection.dropIndex).not.toHaveBeenCalled();
    expect(model.collection.dropIndexes).not.toHaveBeenCalled();
  });

  it('verifies declared unique, partial and TTL options for the full-schema flow', async () => {
    const key = { tenantId: 1, sequence: 1 };
    const options = { unique: true, partialFilterExpression: { sequence: { $type: 'number' } } };
    const model = modelWithIndexes();
    await ensureModelIndexes(model, [[key, options], [{ createdAt: 1 }, { expireAfterSeconds: 0 }]]);
    await ensureModelIndexes(model, [[key, options], [{ createdAt: 1 }, { expireAfterSeconds: 0 }]]);
    expect(model.collection.createIndex).toHaveBeenCalledTimes(2);
  });

  it('fails when createIndex returns success but the index is still absent', async () => {
    const model = modelWithIndexes();
    model.collection.createIndex.mockResolvedValue('claimed_success');
    await expect(ensureModelIndexes(model, [[{ tenantId: 1 }, {}]]))
      .rejects.toThrow('Index verification failed for Example');
  });

  it('propagates an index creation error with model and key context', async () => {
    const model = modelWithIndexes();
    const error = new Error('not authorized');
    model.collection.createIndex.mockRejectedValue(error);
    await expect(ensureModelIndexes(model, [[{ tenantId: 1 }, {}]]))
      .rejects.toMatchObject({ message: 'Failed to create Example index {"tenantId":1}: not authorized', cause: error });
  });

  it('creates indexes for a collection that does not exist yet', async () => {
    const model = modelWithIndexes();
    model.collection.listIndexes.mockImplementationOnce(() => ({
      toArray: async () => { throw Object.assign(new Error('not found'), { code: 26 }); },
    }));
    await ensureModelIndexes(model, [[{ tenantId: 1 }, {}]]);
    expect(model.collection.createIndex).toHaveBeenCalledOnce();
  });

  it('does not treat index-read permission errors as an absent collection', async () => {
    const model = modelWithIndexes();
    model.collection.listIndexes.mockImplementation(() => ({
      toArray: async () => { throw Object.assign(new Error('not authorized'), { code: 13 }); },
    }));
    await expect(ensureModelIndexes(model, [[{ tenantId: 1 }, {}]]))
      .rejects.toThrow('not authorized');
    expect(model.collection.createIndex).not.toHaveBeenCalled();
  });

  it('ensures declared query indexes and required financial idempotency indexes', async () => {
    const fixtures = {};
    for (const modelName of Object.keys(deploymentIndexes)) {
      const fixture = modelWithIndexes();
      fixtures[modelName] = { ...fixture, modelName, schema: models[modelName].schema };
    }
    await ensureDeploymentIndexes(fixtures);
    expect(fixtures.Content.collection.createIndex).toHaveBeenCalledTimes(deploymentIndexes.Content.length);
    expect(fixtures.CollectionEntry.collection.createIndex).toHaveBeenCalledOnce();
    expect(fixtures.Gallery.collection.createIndex).toHaveBeenCalledOnce();
    expect(fixtures.Media.collection.createIndex).toHaveBeenCalledOnce();
    expect(fixtures.BillingPlanChange.collection.createIndex).toHaveBeenCalledWith(
      { tenantId: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { active: true } })
    );
    expect(fixtures.BillingPlanChange.collection.createIndex).toHaveBeenCalledTimes(4);
    expect(models.Content.schema.indexes()).toContainEqual([
      { tenantId: 1, slug: 1 }, { unique: true, background: true },
    ]);
    expect(models.Content.schema.indexes()).toContainEqual([
      { tenantId: 1, status: 1, publishAt: 1 }, { background: true },
    ]);
  });
});
