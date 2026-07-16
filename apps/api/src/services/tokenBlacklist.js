const localRedisClient = require('../lib/localRedis');
const { RevokedToken } = require('@contexthub/common');

// Revoked JWT ids are stored in Redis with a TTL equal to the token's remaining
// lifetime, so the key auto-expires exactly when the token would have anyway.
const KEY_PREFIX = 'auth:jwt:revoked:';

function keyFor(jti) {
  return `${KEY_PREFIX}${jti}`;
}

// MongoDB is the durable source of truth. Redis is only the fast path.
async function revokeJti(jti, ttlSeconds, options = {}) {
  if (!jti) {
    return false;
  }
  const ttl = Math.max(1, Math.floor(ttlSeconds));
  const expiresAt = new Date(Date.now() + ttl * 1000);

  let persisted = false;
  try {
    await RevokedToken.updateOne(
      { jti },
      {
        $set: {
          expiresAt,
          revokedAt: new Date(),
          reason: options.reason || 'logout',
          userId: options.userId || null,
        },
      },
      { upsert: true }
    );
    persisted = true;
  } catch (error) {
    console.error('[tokenBlacklist] Failed to persist revoked jti:', error.message);
  }

  if (localRedisClient.isEnabled()) {
    try {
      await localRedisClient.getClient().set(keyFor(jti), '1', { EX: ttl });
    } catch (error) {
      console.error('[tokenBlacklist] Failed to cache revoked jti:', error.message);
    }
  }

  return persisted;
}

async function isJtiRevoked(jti) {
  if (!jti) {
    return false;
  }

  if (localRedisClient.isEnabled()) {
    try {
      const value = await localRedisClient.getClient().get(keyFor(jti));
      if (value !== null) {
        return true;
      }
    } catch (error) {
      console.error('[tokenBlacklist] Failed to check cached jti:', error.message);
    }
  }

  try {
    return Boolean(await RevokedToken.exists({
      jti,
      expiresAt: { $gt: new Date() },
    }));
  } catch (error) {
    console.error('[tokenBlacklist] Failed to check persisted jti:', error.message);
    // Failing closed avoids reviving a session when revocation state is unknown.
    return true;
  }
}

module.exports = { revokeJti, isJtiRevoked, KEY_PREFIX };
