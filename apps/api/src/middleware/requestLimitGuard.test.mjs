import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localRedisClient = require('../lib/localRedis');
const apiUsageService = require('../services/apiUsageService');
const { checkRequestLimit, shouldSkipLimitGuard } = require('./requestLimitGuard');

function createReply() {
  const reply = {
    statusCode: null,
    payload: null,
    headers: {},
  };
  reply.code = vi.fn((value) => {
    reply.statusCode = value;
    return reply;
  });
  reply.send = vi.fn((value) => {
    reply.payload = value;
    return reply;
  });
  reply.header = vi.fn((name, value) => {
    reply.headers[name.toLowerCase()] = value;
    return reply;
  });
  return reply;
}

function createRequest(overrides = {}) {
  return {
    url: '/api/contents',
    tenantId: 'tenant-1',
    headers: {},
    ...overrides,
  };
}

describe('requestLimitGuard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips guarded-exempt paths without touching Redis', async () => {
    const getFlag = vi.spyOn(localRedisClient, 'getRequestLimitFlag');
    const reply = createReply();

    const blocked = await checkRequestLimit(createRequest({ url: '/health' }), reply);

    expect(blocked).toBe(false);
    expect(getFlag).not.toHaveBeenCalled();
    expect(shouldSkipLimitGuard({ url: '/ready' })).toBe(true);
    expect(shouldSkipLimitGuard({ url: '/api/tenants/abc/limits' })).toBe(true);
  });

  it('passes through when there is no tenant on the request', async () => {
    const getFlag = vi.spyOn(localRedisClient, 'getRequestLimitFlag');
    const reply = createReply();

    const blocked = await checkRequestLimit(createRequest({ tenantId: null }), reply);

    expect(blocked).toBe(false);
    expect(getFlag).not.toHaveBeenCalled();
  });

  it('reads the quota gate with a single Redis lookup and never recomputes usage', async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    const getFlag = vi.spyOn(localRedisClient, 'getRequestLimitFlag').mockResolvedValue(null);
    const reserve = vi.spyOn(apiUsageService, 'reserveRequestQuota');
    const monthlyUsage = vi.spyOn(apiUsageService, 'getMonthlyUsage');
    const reply = createReply();

    const blocked = await checkRequestLimit(createRequest(), reply);

    expect(blocked).toBe(false);
    expect(getFlag).toHaveBeenCalledTimes(1);
    // Hot path must stay off Mongo: no quota reservation, no usage aggregation.
    expect(reserve).not.toHaveBeenCalled();
    expect(monthlyUsage).not.toHaveBeenCalled();
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('allows the request when the gate is explicitly not exceeded', async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(localRedisClient, 'getRequestLimitFlag').mockResolvedValue({
      exceeded: false,
      limit: 1000,
      usage: 12,
      periodKey: '2026-08',
      resetAt: '2026-09-01T00:00:00.000Z',
    });
    const reply = createReply();

    const blocked = await checkRequestLimit(createRequest(), reply);

    expect(blocked).toBe(false);
    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.headers).toMatchObject({
      'x-ratelimit-limit': '1000',
      'x-ratelimit-remaining': '988',
      'x-ratelimit-reset': '1788220800',
      'x-ratelimit-period': '2026-08',
    });
    expect(reply.headers.ratelimit).toContain('"monthly";r=988');
    expect(reply.headers['ratelimit-policy']).toContain('"monthly";q=1000');
  });

  it('fails open for malformed quota state', async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(localRedisClient, 'getRequestLimitFlag').mockResolvedValue({
      limit: 1000,
      usage: 1000,
    });
    const reply = createReply();

    const blocked = await checkRequestLimit(createRequest(), reply);

    expect(blocked).toBe(false);
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('returns 429 with the gate payload when the quota is exceeded', async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(localRedisClient, 'getRequestLimitFlag').mockResolvedValue({
      exceeded: true,
      limit: 1000,
      usage: 1000,
      periodKey: '2026-08',
      resetAt: '2026-09-01T00:00:00.000Z',
    });
    const reply = createReply();
    const request = createRequest();

    const blocked = await checkRequestLimit(request, reply);

    expect(blocked).toBe(true);
    expect(request.requestLimitExceeded).toBe(true);
    expect(reply.statusCode).toBe(429);
    expect(reply.payload).toMatchObject({
      error: 'RequestLimitExceeded',
      limit: 1000,
      usage: 1000,
      periodKey: '2026-08',
      resetAt: '2026-09-01T00:00:00.000Z',
    });
    expect(reply.headers['x-ratelimit-remaining']).toBe('0');
    expect(Number(reply.headers['retry-after'])).toBeGreaterThanOrEqual(0);
  });

  it('localises the 429 message from accept-language', async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(localRedisClient, 'getRequestLimitFlag').mockResolvedValue({
      exceeded: true,
      limit: 10,
      usage: 10,
      periodKey: '2026-08',
    });
    const reply = createReply();

    await checkRequestLimit(createRequest({ headers: { 'accept-language': 'tr-TR,tr;q=0.9' } }), reply);

    expect(reply.payload.message).toBe(reply.payload.messages.tr);
  });

  it('fails open and warns when Redis is unavailable', async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(false);
    const getFlag = vi.spyOn(localRedisClient, 'getRequestLimitFlag');
    const reply = createReply();

    const blocked = await checkRequestLimit(createRequest(), reply);

    expect(blocked).toBe(false);
    expect(getFlag).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('fail-open'));
  });

  it('fails open when the gate lookup throws', async () => {
    vi.spyOn(localRedisClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(localRedisClient, 'getRequestLimitFlag').mockRejectedValue(new Error('connection reset'));
    const reply = createReply();

    const blocked = await checkRequestLimit(createRequest(), reply);

    expect(blocked).toBe(false);
    expect(reply.code).not.toHaveBeenCalled();
  });
});
