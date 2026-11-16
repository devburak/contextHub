import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Fastify = require('fastify')
const auth = require('../middleware/auth')
const limitGuard = require('../middleware/requestLimitGuard')
const queries = require('../services/collectionEntryService')
const redis = require('../lib/localRedis')
const routePath = require.resolve('./publicCollections')
const tenantA = '64b000000000000000000001'
const tenantB = '64b000000000000000000002'
let apps
let now
let counters
let evalCommand

async function worker() {
  // Separate module instances reproduce PM2's separate route caches/counters.
  delete require.cache[routePath]
  const app = Fastify()
  apps.push(app)
  await app.register(require(routePath))
  return app
}

function request(app, { tenant = tenantA, ip = '203.0.113.1', headers = {} } = {}) {
  return app.inject({
    method: 'POST', url: '/public/queries/run',
    headers: { 'x-tenant-id': tenant, 'cf-connecting-ip': ip, ...headers },
    payload: { collection: 'news', limit: 1 },
  })
}

beforeEach(() => {
  apps = []
  now = 1000
  counters = new Map()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(auth, 'tenantContext').mockImplementation(async (req) => {
    req.tenantId = req.headers['x-tenant-id']
  })
  vi.spyOn(limitGuard, 'checkRequestLimit').mockImplementation(async () => {})
  vi.spyOn(queries, 'runCollectionQuery').mockResolvedValue({
    items: [], pagination: { total: 0, limit: 1, offset: 0, page: 1, pages: 0 },
  })
  evalCommand = vi.fn(async (_script, { keys: [key], arguments: [window] }) => {
    let bucket = counters.get(key)
    if (!bucket || bucket.expiresAt <= now) {
      bucket = { count: 0, expiresAt: now + Number(window) }
      counters.set(key, bucket)
    }
    bucket.count += 1
    return [bucket.count, bucket.expiresAt - now, 0]
  })
  vi.spyOn(redis, 'isEnabled').mockReturnValue(true)
  vi.spyOn(redis, 'getClient').mockReturnValue({ eval: evalCommand })
})

afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()))
  vi.restoreAllMocks()
  delete require.cache[routePath]
})

describe('public query shared rate limit', () => {
  it('allows only 60 combined requests across independent workers, including cache hits', async () => {
    const workers = [await worker(), await worker()]
    const responses = await Promise.all(Array.from({ length: 61 }, (_, i) => request(workers[i % 2])))
    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(60)
    const denied = responses.find((response) => response.statusCode === 429)
    expect(denied.json().error).toBe('RateLimitExceeded')
    expect(denied.headers['retry-after']).toBe('60')
    expect(counters.size).toBe(1)
    expect([...counters.keys()][0]).toBe(`rate-limit:public-query:${tenantA}:203.0.113.1`)
  })

  it('isolates tenants and trusted client IPs and ignores spoofed forwarded chains', async () => {
    const app = await worker()
    for (let i = 0; i < 60; i += 1) expect((await request(app)).statusCode).toBe(200)
    expect((await request(app, { headers: { 'x-forwarded-for': '198.51.100.20' } })).statusCode).toBe(429)
    expect((await request(app, { tenant: tenantB })).statusCode).toBe(200)
    expect((await request(app, { ip: '203.0.113.2' })).statusCode).toBe(200)
  })

  it('uses the shared remaining TTL and resets the window without extending it on rejection', async () => {
    const app = await worker()
    for (let i = 0; i < 60; i += 1) await request(app)
    now += 12_001
    expect((await request(app)).headers['retry-after']).toBe('48')
    now += 47_999
    expect((await request(app)).statusCode).toBe(200)
  })

  it.each(['disconnected', 'command failure'])('returns 503 when Redis is unavailable: %s', async (failure) => {
    const app = await worker()
    if (failure === 'disconnected') redis.isEnabled.mockReturnValue(false)
    else evalCommand.mockRejectedValue(new Error('Redis unavailable'))
    const response = await request(app)
    expect(response.statusCode).toBe(503)
    expect(response.json().error).toBe('RateLimitUnavailable')
    expect(response.headers['retry-after']).toBe('5')
    expect(queries.runCollectionQuery).not.toHaveBeenCalled()
  })
})
