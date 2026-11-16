import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const localRedisClient = require('../lib/localRedis');
const throttle = require('./authEmailThrottle');

async function exhaust(action, email) {
  for (let attempt = 1; attempt <= throttle.MAX_PER_WINDOW; attempt += 1) {
    expect((await throttle.consume(action, email)).allowed).toBe(true);
  }
}

describe('authEmailThrottle', () => {
  beforeEach(() => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(false);
    throttle.__resetMemoryStore();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stops further e-mails to one address once the allowance is used', async () => {
    await exhaust('password-reset', 'victim@example.com');

    const blocked = await throttle.consume('password-reset', 'victim@example.com');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(throttle.WINDOW_SECONDS);
  });

  it('treats differently cased and padded spellings as the same address', async () => {
    await exhaust('password-reset', 'victim@example.com');

    expect((await throttle.consume('password-reset', '  Victim@Example.COM ')).allowed).toBe(false);
  });

  it('counts each action and each address separately', async () => {
    await exhaust('password-reset', 'victim@example.com');

    expect((await throttle.consume('verification', 'victim@example.com')).allowed).toBe(true);
    expect((await throttle.consume('password-reset', 'other@example.com')).allowed).toBe(true);
  });

  it('allows requests again after the window has passed', async () => {
    vi.useFakeTimers();
    await exhaust('verification', 'victim@example.com');
    expect((await throttle.consume('verification', 'victim@example.com')).allowed).toBe(false);

    vi.advanceTimersByTime(throttle.WINDOW_SECONDS * 1000 + 1);
    expect((await throttle.consume('verification', 'victim@example.com')).allowed).toBe(true);
  });

  it('uses the shared Redis counter and repairs a counter that has no expiry', async () => {
    const client = {
      incr: vi.fn().mockResolvedValue(throttle.MAX_PER_WINDOW + 1),
      ttl: vi.fn().mockResolvedValue(-1),
      expire: vi.fn().mockResolvedValue(1),
    };
    localRedisClient.isEnabled.mockReturnValue(true);
    vi.spyOn(localRedisClient, 'getClient').mockReturnValue(client);

    const result = await throttle.consume('password-reset', 'victim@example.com');

    const [key] = client.incr.mock.calls[0];
    expect(key).toMatch(/^auth:email-throttle:password-reset:[a-f0-9]{64}$/);
    expect(key).not.toContain('victim');
    expect(client.expire).toHaveBeenCalledWith(key, throttle.WINDOW_SECONDS);
    expect(result).toEqual({ allowed: false, retryAfterSeconds: throttle.WINDOW_SECONDS });
  });
});
