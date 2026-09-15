import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const RedisRateLimitStore = require('./redisRateLimitStore');

function increment(store, key, max = 10, ban = -1) {
  return new Promise((resolve, reject) => {
    store.incr(key, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    }, max, ban);
  });
}

describe('RedisRateLimitStore', () => {
  it('increments an atomic, expiring counter through node-redis', async () => {
    const evalCommand = vi.fn().mockResolvedValue([2, 59000, 0]);
    const provider = {
      isEnabled: () => true,
      getClient: () => ({ eval: evalCommand }),
    };
    const store = new RedisRateLimitStore({
      timeWindow: 60000,
      continueExceeding: false,
    }, provider);

    await expect(increment(store, '203.0.113.8', 10)).resolves.toEqual({
      current: 2,
      ttl: 59000,
      ban: false,
    });
    expect(evalCommand).toHaveBeenCalledOnce();
    expect(evalCommand.mock.calls[0][1]).toEqual({
      keys: ['rate-limit:global:203.0.113.8'],
      arguments: ['60000', '10', '-1', 'false'],
    });
  });

  it('creates an isolated route namespace while sharing the Redis provider', async () => {
    const evalCommand = vi.fn().mockResolvedValue([1, 30000, 0]);
    const provider = {
      isEnabled: () => true,
      getClient: () => ({ eval: evalCommand }),
    };
    const store = new RedisRateLimitStore({ timeWindow: 60000 }, provider);
    const child = store.child({
      timeWindow: 30000,
      continueExceeding: true,
      routeInfo: { method: 'POST', url: '/api/auth/login' },
    });

    await increment(child, '198.51.100.2', 5);

    expect(evalCommand.mock.calls[0][1]).toEqual({
      keys: ['rate-limit:route:POST:%2Fapi%2Fauth%2Flogin:198.51.100.2'],
      arguments: ['30000', '5', '-1', 'true'],
    });
  });

  it('returns an error when shared Redis is unavailable', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const provider = {
      isEnabled: () => false,
      getClient: vi.fn(),
    };
    const store = new RedisRateLimitStore({ timeWindow: 60000 }, provider);

    await expect(increment(store, '192.0.2.1')).rejects.toThrow('Redis is not connected');
    expect(provider.getClient).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });
});
