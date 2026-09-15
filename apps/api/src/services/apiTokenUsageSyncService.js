const { ApiToken } = require('@contexthub/common');
const localRedisClient = require('../lib/localRedis');

const LOCK_KEY = 'usage:api-tokens:sync-lock';
const BATCH_SIZE = 500;
const MAX_BATCHES = 20;

// A newer observation must survive a sync that was already reading the old score.
const REMOVE_FLUSHED_SCRIPT = `
for index = 1, #ARGV, 2 do
  local tokenId = ARGV[index]
  local observedScore = ARGV[index + 1]
  if redis.call('ZSCORE', KEYS[1], tokenId) == observedScore then
    redis.call('ZREM', KEYS[1], tokenId)
  end
end
return 1
`;

async function syncApiTokenUsage(now = new Date()) {
  if (!localRedisClient.isEnabled()) return { skipped: 'redis_unavailable', flushed: 0 };

  const lockToken = await localRedisClient.acquireLock(LOCK_KEY, 15 * 60);
  if (!lockToken) return { skipped: 'sync_in_progress', flushed: 0 };

  let flushed = 0;
  try {
    const client = localRedisClient.getClient();
    const usageKey = localRedisClient.getApiTokenUsageKey();
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const entries = await client.zRangeByScoreWithScores(usageKey, '-inf', now.getTime(), {
        LIMIT: { offset: 0, count: BATCH_SIZE },
      });
      if (!entries.length) break;

      await ApiToken.bulkWrite(entries.map(({ value, score }) => ({
        updateOne: {
          filter: { _id: value },
          update: { $max: { lastUsedAt: new Date(score) } },
        },
      })), { ordered: false });

      await client.eval(REMOVE_FLUSHED_SCRIPT, {
        keys: [usageKey],
        arguments: entries.flatMap(({ value, score }) => [value, String(score)]),
      });
      flushed += entries.length;
      if (entries.length < BATCH_SIZE) break;
    }
    return { flushed };
  } finally {
    await localRedisClient.releaseLock(LOCK_KEY, lockToken);
  }
}

module.exports = { syncApiTokenUsage };
