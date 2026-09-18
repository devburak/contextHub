import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ApiToken } = require('@contexthub/common');
const localRedisClient = require('../lib/localRedis');
const service = require('./apiTokenUsageSyncService');

afterEach(() => vi.restoreAllMocks());

describe('API token usage sync', () => {
  function mockRedis(entries) {
    const client = {
      zRangeByScoreWithScores: vi.fn().mockResolvedValue(entries),
      eval: vi.fn().mockResolvedValue(1),
    };
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(localRedisClient, 'acquireLock').mockResolvedValue('lock-token');
    vi.spyOn(localRedisClient, 'releaseLock').mockResolvedValue(true);
    vi.spyOn(localRedisClient, 'getClient').mockReturnValue(client);
    return client;
  }

  it('writes the maximum observed time and removes only matching Redis scores', async () => {
    const score = Date.parse('2026-09-15T10:00:00.000Z');
    const client = mockRedis([{ value: 'token-1', score }]);
    const write = vi.spyOn(ApiToken, 'bulkWrite').mockResolvedValue({});

    await expect(service.syncApiTokenUsage(new Date(score + 1))).resolves.toEqual({ flushed: 1 });

    expect(write).toHaveBeenCalledWith([{
      updateOne: {
        filter: { _id: 'token-1' },
        update: { $max: { lastUsedAt: new Date(score) } },
      },
    }], { ordered: false });
    expect(client.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('ZSCORE'"), {
      keys: ['usage:api-tokens:last-used'],
      arguments: ['token-1', String(score)],
    });
    expect(localRedisClient.releaseLock).toHaveBeenCalledWith('usage:api-tokens:sync-lock', 'lock-token');
  });

  it('keeps the Redis observation when MongoDB fails', async () => {
    const client = mockRedis([{ value: 'token-1', score: Date.now() }]);
    vi.spyOn(ApiToken, 'bulkWrite').mockRejectedValue(new Error('database unavailable'));

    await expect(service.syncApiTokenUsage()).rejects.toThrow('database unavailable');

    expect(client.eval).not.toHaveBeenCalled();
    expect(localRedisClient.releaseLock).toHaveBeenCalled();
  });
});
