import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ApiToken, Tenant } = require('@contexthub/common');
const localRedisClient = require('../lib/localRedis');
const roleService = require('../services/roleService');
const { authenticate } = require('./auth');
const apiLogger = require('./apiLogger');

afterEach(() => vi.restoreAllMocks());

describe('API token request usage', () => {
  it('adds token time to the existing tenant counter transaction', async () => {
    const previousClient = localRedisClient.client;
    const transaction = {
      hIncrBy: vi.fn().mockReturnThis(),
      hSet: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      zAdd: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([1, 'OK', 1, 1]),
    };
    localRedisClient.client = { multi: vi.fn().mockReturnValue(transaction) };
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    try {
      await expect(localRedisClient.incrementUsageCounter('tenant-1', 'period-1', 60, 'token-1')).resolves.toBe(1);
      expect(localRedisClient.client.multi).toHaveBeenCalledOnce();
      expect(transaction.zAdd).toHaveBeenCalledWith(
        localRedisClient.getApiTokenUsageKey(),
        { score: expect.any(Number), value: 'token-1' },
        { comparison: 'GT' }
      );
    } finally {
      localRedisClient.client = previousClient;
    }
  });

  it('authenticates a GET without saving its token and records use after the response', async () => {
    const save = vi.fn();
    const token = {
      _id: { toString: () => 'token-1' },
      tenantId: { toString: () => 'tenant-1' },
      name: 'reader',
      scopes: ['read'],
      role: 'viewer',
      lastAuditAt: new Date(),
      save,
    };
    vi.spyOn(ApiToken, 'findOne').mockResolvedValue(token);
    vi.spyOn(Tenant, 'findById').mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ status: 'active' }) }),
    });
    vi.spyOn(roleService, 'resolveRole').mockResolvedValue(null);
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(localRedisClient, 'getRequestLimitFlag').mockResolvedValue(null);
    const increment = vi.spyOn(localRedisClient, 'incrementUsageCounter').mockResolvedValue(1);
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
    const request = {
      headers: { authorization: 'Bearer ctx_test' },
      url: '/api/contents',
      method: 'GET',
      query: {},
    };

    await authenticate(request, reply);
    expect(save).not.toHaveBeenCalled();
    expect(request.apiTokenUsageAuthorized).toBe(true);
    expect(increment).not.toHaveBeenCalled();

    await apiLogger(request);
    await new Promise((resolve) => setImmediate(resolve));
    expect(increment).toHaveBeenCalledWith('tenant-1', expect.any(String), expect.any(Number), 'token-1');
  });

  it('uses a throttled background MongoDB update when Redis is unavailable', async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(false);
    const update = vi.spyOn(ApiToken, 'updateOne').mockResolvedValue({ modifiedCount: 1 });
    const request = {
      url: '/api/contents',
      tenantId: 'tenant-1',
      apiTokenUsageAuthorized: true,
      apiToken: { _id: { toString: () => 'token-2' } },
    };

    await apiLogger(request);
    expect(update).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));
    await apiLogger(request);
    await new Promise((resolve) => setImmediate(resolve));

    expect(update).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith({ _id: 'token-2' }, {
      $max: { lastUsedAt: expect.any(Date) },
    });
  });

  it('claims an audit interval with a conditional background update', async () => {
    vi.spyOn(ApiToken, 'findOne').mockResolvedValue({
      _id: 'token-3',
      tenantId: { toString: () => 'tenant-1' },
      name: 'reader',
      scopes: ['read'],
      role: 'viewer',
      lastAuditAt: new Date(Date.now() - 16 * 60 * 1000),
    });
    vi.spyOn(Tenant, 'findById').mockReturnValue({
      select: () => ({ lean: () => Promise.resolve({ status: 'active' }) }),
    });
    vi.spyOn(roleService, 'resolveRole').mockResolvedValue(null);
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(false);
    const update = vi.spyOn(ApiToken, 'updateOne').mockResolvedValue({ modifiedCount: 0 });
    const reply = { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };

    await authenticate({
      headers: { authorization: 'Bearer ctx_test' },
      url: '/api/contents',
      method: 'GET',
      query: {},
    }, reply);
    expect(update).not.toHaveBeenCalled();
    await new Promise((resolve) => setImmediate(resolve));

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      _id: 'token-3',
      revokedAt: null,
      $or: expect.any(Array),
    }), { $set: { lastAuditAt: expect.any(Date) } });
  });
});
