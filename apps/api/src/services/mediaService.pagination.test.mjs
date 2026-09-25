import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

vi.stubEnv('R2_BUCKET', 'test-bucket')
vi.stubEnv('R2_PUBLIC_DOMAIN', 'https://media.example.test')
vi.stubEnv('R2_S3_ENDPOINT', 'https://r2.example.test')
vi.stubEnv('R2_ACCESS_KEY', 'test-access-key')
vi.stubEnv('R2_SECRET_KEY', 'test-secret-key')

const require = createRequire(import.meta.url)
const { Media } = require('@contexthub/common')
const mediaService = require('./mediaService')

function mockFind(rows) {
  const query = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(rows),
  }
  vi.spyOn(Media, 'find').mockReturnValue(query)
  return query
}

afterEach(() => vi.restoreAllMocks())
afterAll(() => vi.unstubAllEnvs())

describe('media list pagination', () => {
  it('fetches one extra row to report another page without counting', async () => {
    const rows = Array.from({ length: 21 }, (_, id) => ({ id }))
    const query = mockFind(rows)
    const count = vi.spyOn(Media, 'countDocuments')

    const result = await mediaService.listMedia({ tenantId: 'tenant-1', pagination: { page: 2, limit: 20 } })

    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1 })
    expect(query.skip).toHaveBeenCalledWith(20)
    expect(query.limit).toHaveBeenCalledWith(21)
    expect(result).toEqual({
      items: rows.slice(0, 20),
      pagination: { page: 2, limit: 20, hasMore: true },
    })
    expect(count).not.toHaveBeenCalled()
  })

  it('stops at an exact full page and preserves the page-size cap', async () => {
    const rows = Array.from({ length: 100 }, (_, id) => ({ id }))
    const query = mockFind(rows)

    const result = await mediaService.listMedia({ tenantId: 'tenant-1', pagination: { limit: 500 } })

    expect(query.limit).toHaveBeenCalledWith(101)
    expect(result.items).toHaveLength(100)
    expect(result.pagination).toEqual({ page: 1, limit: 100, hasMore: false })
  })
})

describe('media search', () => {
  it.each(['Afiş', 'AFİŞ', 'Afis'])('finds decomposed Turkish file names with %s', async (search) => {
    mockFind([])

    await mediaService.listMedia({ tenantId: 'tenant-1', filters: { search } })

    const query = vi.mocked(Media.find).mock.calls[0][0]
    expect(query.$or[0].originalName.test('Afis\u0327 O\u0308zelles\u0327tirme.pdf')).toBe(true)
    expect(query.$or[0].originalName.test('AFİŞ Özelleştirme.pdf')).toBe(true)
  })
})
