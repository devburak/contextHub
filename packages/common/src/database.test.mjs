import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import database from './database.js';
import models from './models/index.js';
import deploymentIndexes from './deploymentIndexes.js';
import mongoose from 'mongoose';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function stubModelCollections() {
  const operations = {};
  for (const [modelName, model] of Object.entries(models)) {
    if (!model.schema || !model.collection) continue;
    const indexes = [];
    const list = vi.spyOn(model.collection, 'listIndexes').mockImplementation(() => ({
      toArray: async () => [...indexes],
    }));
    const create = vi.spyOn(model.collection, 'createIndex').mockImplementation(async (key, options = {}) => {
      indexes.push({ key, name: JSON.stringify(key), ...options });
    });
    const drop = vi.spyOn(model.collection, 'dropIndexes').mockRejectedValue(new Error('Index deletion forbidden'));
    operations[modelName] = { list, create, drop };
  }
  return operations;
}

describe('database index startup policy', () => {
  it.each(['true', 'false'])('connectDB does no index/collection creation with flag %s', async (flag) => {
    vi.stubEnv('MONGODB_AUTO_CREATE_INDEXES', flag);
    const operations = stubModelCollections();
    const connection = { connection: { host: 'test-only' } };
    const connect = vi.spyOn(mongoose, 'connect').mockResolvedValue(connection);
    expect(await database.connectDB()).toBe(connection);
    expect(connect).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ autoIndex: false, autoCreate: false }));
    for (const operation of Object.values(operations)) {
      expect(operation.list).not.toHaveBeenCalled();
      expect(operation.create).not.toHaveBeenCalled();
      expect(operation.drop).not.toHaveBeenCalled();
    }
  });

  it('ensures the three deployment indexes with the existing false flag, idempotently', async () => {
    vi.stubEnv('MONGODB_AUTO_CREATE_INDEXES', 'false');
    const operations = stubModelCollections();
    await database.initializeIndexes();
    await database.initializeIndexes();
    for (const [modelName, operation] of Object.entries(operations)) {
      expect(operation.create).toHaveBeenCalledTimes(deploymentIndexes[modelName]?.length || 0);
      if (!deploymentIndexes[modelName]) expect(operation.list).not.toHaveBeenCalled();
      expect(operation.drop).not.toHaveBeenCalled();
    }
  });

  it('also ensures and verifies every declared schema index when the flag is true', async () => {
    vi.stubEnv('MONGODB_AUTO_CREATE_INDEXES', 'true');
    const operations = stubModelCollections();
    await database.initializeIndexes();
    for (const [modelName, operation] of Object.entries(operations)) {
      const actualIndexes = await models[modelName].collection.listIndexes().toArray();
      for (const [key, options] of models[modelName].schema.indexes()) {
        expect(actualIndexes).toContainEqual(expect.objectContaining({ key, ...options }));
      }
      expect(operation.drop).not.toHaveBeenCalled();
    }
  });

  it('rejects startup if a required index cannot be verified', async () => {
    vi.stubEnv('MONGODB_AUTO_CREATE_INDEXES', 'false');
    const operations = stubModelCollections();
    operations.Content.create.mockResolvedValue('index-not-built');
    await expect(database.initializeIndexes()).rejects.toThrow('Index verification failed for Content');
  });

  it('rejects connection errors so the caller can handle a failed startup', async () => {
    vi.spyOn(mongoose, 'connect').mockRejectedValue(new Error('connection failed'));
    await expect(database.connectDB()).rejects.toThrow('connection failed');
  });
});
