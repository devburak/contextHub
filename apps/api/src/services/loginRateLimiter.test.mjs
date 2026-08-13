import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const localRedisClient = require('../lib/localRedis');
const limiter = require('./loginRateLimiter');

describe('loginRateLimiter', () => {
  beforeEach(() => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(false);
    limiter.__resetMemoryStore();
  });

  it('blocks a targeted email even when the attacker rotates IP addresses', async () => {
    for (let attempt = 1; attempt <= limiter.EMAIL_MAX_ATTEMPTS; attempt += 1) {
      await limiter.recordFailedAttempt('victim@example.com', `198.51.100.${attempt}`);
    }

    const status = await limiter.isBlocked('victim@example.com', '203.0.113.200');
    expect(status.blocked).toBe(true);
    expect(status.blockedScopes).toContain('email');
  });

  it('blocks credential stuffing from one IP across different emails', async () => {
    for (let attempt = 1; attempt <= limiter.IP_MAX_ATTEMPTS; attempt += 1) {
      await limiter.recordFailedAttempt(`person-${attempt}@example.com`, '198.51.100.50');
    }

    const status = await limiter.isBlocked('fresh@example.com', '198.51.100.50');
    expect(status.blocked).toBe(true);
    expect(status.blockedScopes).toContain('ip');
  });

  it('does not clear the IP bucket after a successful account login', async () => {
    for (let attempt = 1; attempt < limiter.IP_MAX_ATTEMPTS; attempt += 1) {
      await limiter.recordFailedAttempt(`person-${attempt}@example.com`, '198.51.100.75');
    }

    await limiter.reset('known-good@example.com', '198.51.100.75');
    await limiter.recordFailedAttempt('last@example.com', '198.51.100.75');

    const status = await limiter.isBlocked('another@example.com', '198.51.100.75');
    expect(status.blockedScopes).toContain('ip');
  });
});
