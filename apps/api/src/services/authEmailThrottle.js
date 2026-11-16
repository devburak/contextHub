const crypto = require('crypto');
const localRedisClient = require('../lib/localRedis');

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// How many account e-mails (password reset, verification) one address may
// trigger per window. The route-level IP limit stops one client; this stops
// many clients from flooding a single inbox.
const MAX_PER_WINDOW = positiveInteger(process.env.AUTH_EMAIL_ACTION_MAX, 3);
const WINDOW_SECONDS = 15 * 60;
const MEMORY_PRUNE_THRESHOLD = 10000;

// Fallback when Redis is unavailable: per-process and non-persistent, the same
// trade-off loginRateLimiter makes.
const memoryStore = new Map();

function throttleKey(action, email) {
  const normalized = String(email || '').trim().toLowerCase() || 'unknown';
  const digest = crypto.createHash('sha256').update(`${action}:${normalized}`).digest('hex');
  return `auth:email-throttle:${action}:${digest}`;
}

function toResult(count, retryAfterSeconds) {
  const allowed = count <= MAX_PER_WINDOW;
  return { allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, retryAfterSeconds) };
}

function consumeFromMemory(key) {
  const now = Date.now();
  if (memoryStore.size > MEMORY_PRUNE_THRESHOLD) {
    for (const [storedKey, entry] of memoryStore) {
      if (entry.expiresAt <= now) memoryStore.delete(storedKey);
    }
  }

  let entry = memoryStore.get(key);
  if (!entry || entry.expiresAt <= now) {
    entry = { count: 0, expiresAt: now + WINDOW_SECONDS * 1000 };
    memoryStore.set(key, entry);
  }
  entry.count += 1;
  return toResult(entry.count, Math.ceil((entry.expiresAt - now) / 1000));
}

/**
 * Counts one request for `action` against `email` and reports whether it is
 * still inside the allowance. The result does not depend on whether an account
 * exists for the address, so callers may surface it without leaking that.
 */
async function consume(action, email) {
  const key = throttleKey(action, email);

  if (localRedisClient.isEnabled()) {
    try {
      const client = localRedisClient.getClient();
      const count = await client.incr(key);
      let ttl = await client.ttl(key);
      // Also repairs a counter left without expiry by a crash between INCR and EXPIRE.
      if (!Number.isFinite(ttl) || ttl < 0) {
        await client.expire(key, WINDOW_SECONDS);
        ttl = WINDOW_SECONDS;
      }
      return toResult(count, ttl);
    } catch (error) {
      console.error('[AuthEmailThrottle] Redis counter failed:', error.message);
    }
  }

  return consumeFromMemory(key);
}

function __resetMemoryStore() {
  memoryStore.clear();
}

module.exports = {
  consume,
  MAX_PER_WINDOW,
  WINDOW_SECONDS,
  __resetMemoryStore,
};
