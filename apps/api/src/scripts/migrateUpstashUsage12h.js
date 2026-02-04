const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const { database } = require('@contexthub/common');
const ApiUsage = require('@contexthub/common/src/models/ApiUsage');
const upstashClient = require('../lib/upstash');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const SOURCE = (process.env.UPSTASH_MIGRATE_SOURCE || 'counts').toLowerCase(); // counts | logs
const PATTERN = process.env.UPSTASH_MIGRATE_PATTERN
  || (SOURCE === 'logs' ? 'api:log:*' : 'api:count:12h:*');
const SCAN_COUNT = Number(process.env.UPSTASH_SCAN_COUNT || 1000);
const BULK_SIZE = Number(process.env.MONGO_BULK_SIZE || 1000);
const PAUSE_MS = Number(process.env.UPSTASH_PAUSE_MS || 0);
const DELETE_KEYS = String(process.env.UPSTASH_DELETE_AFTER || '').toLowerCase() === 'true';
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const MAX_KEYS = Number(process.env.UPSTASH_MAX_KEYS || 0);

const PERIOD_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(00|12)$/;
const LOG_KEY_REGEX = /^api:log:([^:]+):(\d{10,})$/;
const COUNT_KEY_REGEX = /^api:count:12h:([^:]+):(.+)$/;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePeriodKey(periodKey) {
  const match = PERIOD_REGEX.exec(periodKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4]);

  const startDate = new Date(Date.UTC(year, month, day, hour, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month, day, hour + 12, 0, 0, 0));
  const endDate = new Date(endExclusive.getTime() - 1);

  return { startDate, endDate };
}

function getPeriodKeyFromTimestamp(timestamp) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = date.getUTCHours() < 12 ? '00' : '12';
  return `${year}-${month}-${day}T${hour}`;
}

function resolveTenantObjectId(tenantId) {
  if (!tenantId || tenantId === 'system') {
    return null;
  }

  return mongoose.Types.ObjectId.isValid(tenantId)
    ? new mongoose.Types.ObjectId(tenantId)
    : null;
}

async function bulkUpsertCounts(items) {
  if (!items.length) return { saved: 0 };
  if (DRY_RUN) return { saved: items.length };

  const ops = items.map(item => ({
    updateOne: {
      filter: {
        tenantId: item.tenantObjectId,
        period: 'halfday',
        periodKey: item.periodKey,
      },
      update: {
        $set: {
          period: 'halfday',
          periodKey: item.periodKey,
          startDate: item.startDate,
          endDate: item.endDate,
          totalCalls: item.totalCalls,
          syncedAt: new Date(),
          redisKeys: item.redisKeys || [],
        },
      },
      upsert: true,
    },
  }));

  await ApiUsage.bulkWrite(ops, { ordered: false });
  return { saved: ops.length };
}

async function bulkIncrementCounts(items) {
  if (!items.length) return { saved: 0 };
  if (DRY_RUN) return { saved: items.length };

  const ops = items.map(item => ({
    updateOne: {
      filter: {
        tenantId: item.tenantObjectId,
        period: 'halfday',
        periodKey: item.periodKey,
      },
      update: {
        $inc: { totalCalls: item.totalCalls },
        $set: {
          period: 'halfday',
          periodKey: item.periodKey,
          startDate: item.startDate,
          endDate: item.endDate,
          syncedAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  await ApiUsage.bulkWrite(ops, { ordered: false });
  return { saved: ops.length };
}

async function migrateCounts(client) {
  let cursor = 0;
  let scanned = 0;
  let processed = 0;
  let saved = 0;
  let deleted = 0;
  let skipped = 0;

  do {
    const result = await client.scan(cursor, { match: PATTERN, count: SCAN_COUNT });
    const nextCursor = Array.isArray(result) ? result[0] : result?.cursor;
    const keys = Array.isArray(result) ? result[1] : result?.keys;

    cursor = Number(nextCursor || 0);
    if (!Array.isArray(keys) || keys.length === 0) {
      if (cursor === 0) break;
      continue;
    }

    scanned += keys.length;

    const values = await client.mget(...keys);
    const items = [];

    keys.forEach((key, index) => {
      const value = values?.[index];
      const parsed = COUNT_KEY_REGEX.exec(key);
      if (!parsed) {
        skipped += 1;
        return;
      }

      const tenantId = parsed[1];
      const periodKey = parsed[2];
      const period = parsePeriodKey(periodKey);
      const tenantObjectId = resolveTenantObjectId(tenantId);
      const totalCalls = Number(value || 0);

      if (!tenantObjectId || !period || !Number.isFinite(totalCalls) || totalCalls <= 0) {
        skipped += 1;
        return;
      }

      items.push({
        tenantObjectId,
        periodKey,
        startDate: period.startDate,
        endDate: period.endDate,
        totalCalls,
        redisKeys: [{ key, value: totalCalls }],
      });
    });

    const resultBatch = await bulkUpsertCounts(items);
    saved += resultBatch.saved;
    processed += items.length;

    if (DELETE_KEYS && keys.length) {
      if (!DRY_RUN) {
        await client.del(...keys);
      }
      deleted += keys.length;
    }

    if (MAX_KEYS > 0 && scanned >= MAX_KEYS) break;
    if (PAUSE_MS > 0) await sleep(PAUSE_MS);
  } while (cursor !== 0);

  return { scanned, processed, saved, deleted, skipped };
}

async function migrateLogs(client) {
  let cursor = 0;
  let scanned = 0;
  let processed = 0;
  let saved = 0;
  let deleted = 0;
  let skipped = 0;

  let bucket = new Map();
  let pendingDeletes = [];

  const flush = async () => {
    if (bucket.size === 0) return;
    const items = [];

    for (const item of bucket.values()) {
      items.push(item);
    }

    const resultBatch = await bulkIncrementCounts(items);
    saved += resultBatch.saved;
    processed += items.length;
    bucket = new Map();

    if (DELETE_KEYS && pendingDeletes.length) {
      if (!DRY_RUN) {
        await client.del(...pendingDeletes);
      }
      deleted += pendingDeletes.length;
      pendingDeletes = [];
    }
  };

  do {
    const result = await client.scan(cursor, { match: PATTERN, count: SCAN_COUNT });
    const nextCursor = Array.isArray(result) ? result[0] : result?.cursor;
    const keys = Array.isArray(result) ? result[1] : result?.keys;

    cursor = Number(nextCursor || 0);
    if (!Array.isArray(keys) || keys.length === 0) {
      if (cursor === 0) break;
      continue;
    }

    scanned += keys.length;

    for (const key of keys) {
      const parsed = LOG_KEY_REGEX.exec(key);
      if (!parsed) {
        skipped += 1;
        continue;
      }

      const tenantId = parsed[1];
      const timestamp = Number(parsed[2]);
      const tenantObjectId = resolveTenantObjectId(tenantId);

      if (!tenantObjectId || !Number.isFinite(timestamp)) {
        skipped += 1;
        continue;
      }

      const periodKey = getPeriodKeyFromTimestamp(timestamp);
      const period = parsePeriodKey(periodKey);
      if (!period) {
        skipped += 1;
        continue;
      }

      const bucketKey = `${tenantId}:${periodKey}`;
      const existing = bucket.get(bucketKey);
      if (existing) {
        existing.totalCalls += 1;
      } else {
        bucket.set(bucketKey, {
          tenantObjectId,
          periodKey,
          startDate: period.startDate,
          endDate: period.endDate,
          totalCalls: 1,
        });
      }
    }

    pendingDeletes.push(...keys);

    if (bucket.size >= BULK_SIZE) {
      await flush();
    }

    if (MAX_KEYS > 0 && scanned >= MAX_KEYS) break;
    if (PAUSE_MS > 0) await sleep(PAUSE_MS);
  } while (cursor !== 0);

  await flush();

  return { scanned, processed, saved, deleted, skipped };
}

async function main() {
  if (!upstashClient.isEnabled()) {
    console.error('[UpstashMigration] Upstash Redis is not enabled.');
    process.exit(1);
  }

  await database.connectDB();

  const client = upstashClient.getClient();
  console.log('[UpstashMigration] Starting...', {
    source: SOURCE,
    pattern: PATTERN,
    scanCount: SCAN_COUNT,
    bulkSize: BULK_SIZE,
    deleteKeys: DELETE_KEYS,
    dryRun: DRY_RUN,
    maxKeys: MAX_KEYS || 'unlimited',
  });

  let result;
  if (SOURCE === 'logs') {
    result = await migrateLogs(client);
  } else {
    result = await migrateCounts(client);
  }

  console.log('[UpstashMigration] Completed:', result);

  await database.disconnectDB();
}

main().catch(error => {
  console.error('[UpstashMigration] Failed:', error);
  process.exit(1);
});
