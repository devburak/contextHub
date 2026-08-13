const crypto = require('crypto');
const localRedisClient = require('../lib/localRedis');

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const EMAIL_MAX_ATTEMPTS = positiveInteger(process.env.LOGIN_EMAIL_MAX_ATTEMPTS, 5);
const IP_MAX_ATTEMPTS = positiveInteger(process.env.LOGIN_IP_MAX_ATTEMPTS, 20);
const BLOCK_TTL_SECONDS = process.env.NODE_ENV === 'development' ? 60 : 60 * 60;
const ATTEMPT_TTL_SECONDS = process.env.NODE_ENV === 'development' ? 60 : 60 * 60;

// Fallback in-memory store when Redis is unavailable (non-persistent).
const memoryStore = new Map();

function hashScope(scope, value) {
  return crypto.createHash('sha256').update(`${scope}:${value}`).digest('hex');
}

function normalizeEmail(email = '') {
  return String(email || '').trim().toLowerCase() || 'unknown';
}

function normalizeIp(ip = '') {
  return String(ip || '').trim().toLowerCase() || 'unknown';
}

function getBuckets(email, ip) {
  return [
    {
      scope: 'email',
      key: hashScope('email', normalizeEmail(email)),
      maxAttempts: EMAIL_MAX_ATTEMPTS,
    },
    {
      scope: 'ip',
      key: hashScope('ip', normalizeIp(ip)),
      maxAttempts: IP_MAX_ATTEMPTS,
    },
  ];
}

function blockKey(bucket) {
  return `login:block:${bucket.scope}:${bucket.key}`;
}

function attemptKey(bucket) {
  return `login:attempts:${bucket.scope}:${bucket.key}`;
}

function combineBlockedStates(states) {
  const blockedStates = states.filter((state) => state.blocked);
  return {
    blocked: blockedStates.length > 0,
    retryAfterSeconds: blockedStates.length
      ? Math.max(...blockedStates.map((state) => state.retryAfterSeconds || 0))
      : 0,
    blockedScopes: blockedStates.map((state) => state.scope),
  };
}

async function isBlocked(email, ip) {
  const buckets = getBuckets(email, ip);

  if (localRedisClient.isEnabled()) {
    try {
      const client = localRedisClient.getClient();
      const states = await Promise.all(buckets.map(async (bucket) => {
        const ttl = await client.ttl(blockKey(bucket));
        return {
          scope: bucket.scope,
          blocked: Number.isFinite(ttl) && ttl > 0,
          retryAfterSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : 0,
        };
      }));
      return combineBlockedStates(states);
    } catch (error) {
      console.error('[LoginLimiter] Redis block check failed:', error.message);
    }
  }

  const now = Date.now();
  const states = buckets.map((bucket) => {
    const entry = memoryStore.get(`${bucket.scope}:${bucket.key}`);
    const blocked = Boolean(entry?.blockUntil && entry.blockUntil > now);
    return {
      scope: bucket.scope,
      blocked,
      retryAfterSeconds: blocked ? Math.ceil((entry.blockUntil - now) / 1000) : 0,
    };
  });

  return combineBlockedStates(states);
}

async function recordRedisFailure(client, bucket) {
  const attemptsKey = attemptKey(bucket);
  const attempts = await client.incr(attemptsKey);

  if (attempts === 1) {
    await client.expire(attemptsKey, ATTEMPT_TTL_SECONDS);
  }

  if (attempts >= bucket.maxAttempts) {
    await client.set(blockKey(bucket), '1', { EX: BLOCK_TTL_SECONDS });
    await client.del(attemptsKey);
    return { scope: bucket.scope, attempts: bucket.maxAttempts, blocked: true };
  }

  return { scope: bucket.scope, attempts, blocked: false };
}

function recordMemoryFailure(bucket) {
  const key = `${bucket.scope}:${bucket.key}`;
  const now = Date.now();
  const entry = memoryStore.get(key) || {
    attempts: 0,
    expiresAt: now + ATTEMPT_TTL_SECONDS * 1000,
  };

  if (entry.expiresAt < now) {
    entry.attempts = 0;
    entry.expiresAt = now + ATTEMPT_TTL_SECONDS * 1000;
  }

  entry.attempts += 1;
  if (entry.attempts >= bucket.maxAttempts) {
    entry.blockUntil = now + BLOCK_TTL_SECONDS * 1000;
    entry.attempts = 0;
    memoryStore.set(key, entry);
    return { scope: bucket.scope, attempts: bucket.maxAttempts, blocked: true };
  }

  memoryStore.set(key, entry);
  return { scope: bucket.scope, attempts: entry.attempts, blocked: false };
}

function summarizeAttempts(results) {
  const emailResult = results.find((result) => result.scope === 'email');
  return {
    attempts: emailResult?.attempts || 0,
    blocked: results.some((result) => result.blocked),
    blockedScopes: results.filter((result) => result.blocked).map((result) => result.scope),
  };
}

async function recordFailedAttempt(email, ip) {
  const buckets = getBuckets(email, ip);

  if (localRedisClient.isEnabled()) {
    try {
      const client = localRedisClient.getClient();
      const results = [];
      for (const bucket of buckets) {
        results.push(await recordRedisFailure(client, bucket));
      }
      return summarizeAttempts(results);
    } catch (error) {
      console.error('[LoginLimiter] Redis record failed attempt error:', error.message);
    }
  }

  return summarizeAttempts(buckets.map(recordMemoryFailure));
}

/**
 * A successful login clears only the account bucket. Clearing the IP bucket
 * would let an attacker use one known credential to reset a credential-
 * stuffing limit for every other account.
 */
async function reset(email) {
  const emailBucket = getBuckets(email, 'unknown')[0];
  const memoryKey = `${emailBucket.scope}:${emailBucket.key}`;

  if (localRedisClient.isEnabled()) {
    try {
      const client = localRedisClient.getClient();
      await client.del(attemptKey(emailBucket));
      await client.del(blockKey(emailBucket));
      memoryStore.delete(memoryKey);
      return true;
    } catch (error) {
      console.error('[LoginLimiter] Redis reset failed:', error.message);
    }
  }

  memoryStore.delete(memoryKey);
  return true;
}

function __resetMemoryStore() {
  memoryStore.clear();
}

module.exports = {
  isBlocked,
  recordFailedAttempt,
  reset,
  EMAIL_MAX_ATTEMPTS,
  IP_MAX_ATTEMPTS,
  MAX_ATTEMPTS: EMAIL_MAX_ATTEMPTS,
  BLOCK_TTL_SECONDS,
  __resetMemoryStore,
};
