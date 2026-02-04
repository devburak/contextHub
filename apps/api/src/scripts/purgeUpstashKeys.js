const path = require('path');
const dotenv = require('dotenv');
const upstashClient = require('../lib/upstash');

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const PATTERNS = (process.env.UPSTASH_PURGE_PATTERNS || 'api:log:*')
  .split(',')
  .map(pattern => pattern.trim())
  .filter(Boolean);

const FLUSH_DB = String(process.env.UPSTASH_FLUSHDB || '').toLowerCase() === 'true';
const SCAN_COUNT = Number(process.env.UPSTASH_SCAN_COUNT || 1000);
const DEL_BATCH = Number(process.env.UPSTASH_DEL_BATCH || 500);
const PAUSE_MS = Number(process.env.UPSTASH_PAUSE_MS || 0);
const MAX_KEYS = Number(process.env.UPSTASH_MAX_KEYS || 0); // 0 = unlimited
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scanKeys(client, cursor, match, count) {
  try {
    return await client.scan(cursor, { match, count });
  } catch (error) {
    return await client.scan({ cursor, match, count });
  }
}

function parseScanResult(result) {
  if (Array.isArray(result)) {
    return { cursor: Number(result[0] || 0), keys: result[1] || [] };
  }
  return {
    cursor: Number(result?.cursor || 0),
    keys: result?.keys || [],
  };
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function deleteKeys(client, keys) {
  if (!keys.length) return 0;
  if (DRY_RUN) return keys.length;

  let deleted = 0;
  const chunks = chunkArray(keys, DEL_BATCH);
  for (const batch of chunks) {
    if (batch.length === 0) continue;
    await client.del(...batch);
    deleted += batch.length;
  }
  return deleted;
}

async function purgePattern(client, pattern) {
  let cursor = 0;
  let scanned = 0;
  let deleted = 0;

  do {
    const result = await scanKeys(client, cursor, pattern, SCAN_COUNT);
    const parsed = parseScanResult(result);
    cursor = parsed.cursor;
    const keys = Array.isArray(parsed.keys) ? parsed.keys : [];

    if (keys.length) {
      scanned += keys.length;
      deleted += await deleteKeys(client, keys);
    }

    if (MAX_KEYS > 0 && deleted >= MAX_KEYS) {
      return { scanned, deleted, capped: true };
    }

    if (PAUSE_MS > 0) await sleep(PAUSE_MS);
  } while (cursor !== 0);

  return { scanned, deleted };
}

async function main() {
  if (!upstashClient.isEnabled()) {
    console.error('[UpstashPurge] Upstash Redis is not enabled.');
    process.exit(1);
  }

  const client = upstashClient.getClient();
  console.log('[UpstashPurge] Starting...', {
    patterns: PATTERNS,
    flushdb: FLUSH_DB,
    scanCount: SCAN_COUNT,
    delBatch: DEL_BATCH,
    dryRun: DRY_RUN,
    maxKeys: MAX_KEYS || 'unlimited',
  });

  if (FLUSH_DB) {
    if (DRY_RUN) {
      console.log('[UpstashPurge] DRY_RUN=true, skipping flushdb');
    } else {
      await client.flushdb();
      console.log('[UpstashPurge] flushdb completed');
    }
    return;
  }

  const totals = { scanned: 0, deleted: 0 };
  for (const pattern of PATTERNS) {
    const result = await purgePattern(client, pattern);
    console.log('[UpstashPurge] Pattern completed:', { pattern, ...result });
    totals.scanned += result.scanned || 0;
    totals.deleted += result.deleted || 0;
    if (result.capped) break;
  }

  console.log('[UpstashPurge] Completed:', totals);
}

main().catch(error => {
  console.error('[UpstashPurge] Failed:', error);
  process.exit(1);
});
