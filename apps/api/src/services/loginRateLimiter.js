const crypto = require('crypto');
const localRedisClient = require('../lib/localRedis');

const MAX_ATTEMPTS = 5;
const BLOCK_TTL_SECONDS = process.env.NODE_ENV === 'development' ? 60 : 60 * 60; // 1 min dev, 1 hour prod
const ATTEMPT_TTL_SECONDS = process.env.NODE_ENV === 'development' ? 60 : 60 * 60; // Track attempts over window

// Fallback in-memory store when Redis is unavailable (non-persistent)
const memoryStore = new Map();

function buildKey(email = '', ip = '') {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const normalizedIp = (ip || '').trim().toLowerCase() || 'unknown';
  const raw = `${normalizedEmail}|${normalizedIp}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function isBlocked(email, ip) {
  const key = buildKey(email, ip);

  if (localRedisClient.isEnabled()) {
    try {
      const client = localRedisClient.getClient();
      const blockKey = `login:block:${key}`;
      const ttl = await client.ttl(blockKey);
      if (ttl && ttl > 0) {
        return { blocked: true, retryAfterSeconds: ttl };
      }
      return { blocked: false, retryAfterSeconds: 0 };
    } catch (error) {
      console.error('[LoginLimiter] Redis block check failed:', error.message);
    }
  }

  const entry = memoryStore.get(key);
  if (entry && entry.blockUntil && entry.blockUntil > Date.now()) {
    const retryAfterSeconds = Math.ceil((entry.blockUntil - Date.now()) / 1000);
    return { blocked: true, retryAfterSeconds };
  }

  return { blocked: false, retryAfterSeconds: 0 };
}

async function recordFailedAttempt(email, ip) {
  const key = buildKey(email, ip);

  if (localRedisClient.isEnabled()) {
    try {
      const client = localRedisClient.getClient();
      const attemptKey = `login:attempts:${key}`;
      const blockKey = `login:block:${key}`;

      const attempts = await client.incr(attemptKey);

      if (attempts === 1) {
        await client.expire(attemptKey, ATTEMPT_TTL_SECONDS);
      }

      if (attempts >= MAX_ATTEMPTS) {
        await client.set(blockKey, '1', { EX: BLOCK_TTL_SECONDS });
        await client.del(attemptKey);
        return { attempts: MAX_ATTEMPTS, blocked: true };
      }

      return { attempts, blocked: false };
    } catch (error) {
      console.error('[LoginLimiter] Redis record failed attempt error:', error.message);
    }
  }

  const entry = memoryStore.get(key) || { attempts: 0, expiresAt: Date.now() + ATTEMPT_TTL_SECONDS * 1000 };
  const now = Date.now();

  if (entry.expiresAt < now) {
    entry.attempts = 0;
    entry.expiresAt = now + ATTEMPT_TTL_SECONDS * 1000;
  }

  entry.attempts += 1;

  if (entry.attempts >= MAX_ATTEMPTS) {
    entry.blockUntil = now + BLOCK_TTL_SECONDS * 1000;
    entry.attempts = 0;
    memoryStore.set(key, entry);
    return { attempts: MAX_ATTEMPTS, blocked: true };
  }

  memoryStore.set(key, entry);
  return { attempts: entry.attempts, blocked: false };
}

async function reset(email, ip) {
  const key = buildKey(email, ip);

  if (localRedisClient.isEnabled()) {
    try {
      const client = localRedisClient.getClient();
      await client.del(`login:attempts:${key}`);
      await client.del(`login:block:${key}`);
      return true;
    } catch (error) {
      console.error('[LoginLimiter] Redis reset failed:', error.message);
    }
  }

  memoryStore.delete(key);
  return true;
}

module.exports = {
  isBlocked,
  recordFailedAttempt,
  reset,
  MAX_ATTEMPTS,
  BLOCK_TTL_SECONDS
};
