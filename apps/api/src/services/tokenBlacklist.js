const localRedisClient = require('../lib/localRedis');

// Revoked JWT ids are stored in Redis with a TTL equal to the token's remaining
// lifetime, so the key auto-expires exactly when the token would have anyway.
const KEY_PREFIX = 'auth:jwt:revoked:';

function keyFor(jti) {
  return `${KEY_PREFIX}${jti}`;
}

// Best-effort revocation: if Redis is unavailable we cannot blacklist. This fails
// open (the token stays valid until its natural expiry) — the same trade-off the rest
// of the platform makes for Redis-backed enforcement. tokenVersion remains the
// hard, DB-backed revocation lever for "log out everywhere".
async function revokeJti(jti, ttlSeconds) {
  if (!jti || !localRedisClient.isEnabled()) {
    return false;
  }
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  try {
    await localRedisClient.getClient().set(keyFor(jti), '1', { EX: ttl });
    return true;
  } catch (error) {
    console.error('[tokenBlacklist] Failed to revoke jti:', error.message);
    return false;
  }
}

async function isJtiRevoked(jti) {
  if (!jti || !localRedisClient.isEnabled()) {
    return false;
  }
  try {
    const value = await localRedisClient.getClient().get(keyFor(jti));
    return value !== null;
  } catch (error) {
    console.error('[tokenBlacklist] Failed to check jti:', error.message);
    return false;
  }
}

module.exports = { revokeJti, isJtiRevoked, KEY_PREFIX };
