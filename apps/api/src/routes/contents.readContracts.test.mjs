import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Fastify = require('fastify')
const auth = require('../middleware/auth')
const common = require('@contexthub/common')
const contentService = require('../services/contentService')
const tenantId = '64b000000000000000000001'
const contentId = '64b000000000000000000002'
const versionId = '64b000000000000000000003'
let app

beforeEach(async () => {
  vi.spyOn(auth, 'tenantContext').mockImplementation(async (request) => { request.tenantId = tenantId })
  vi.spyOn(auth, 'authenticate').mockImplementation(async (request) => {
    request.authType = request.headers['x-test-auth-type'] || 'session'
  })
  vi.spyOn(auth, 'requireEditor').mockImplementation(async () => {})
  delete require.cache[require.resolve('./contents')]
  app = Fastify()
  await app.register(require('./contents'))
})

afterEach(async () => {
  await app.close()
  vi.restoreAllMocks()
  delete require.cache[require.resolve('./contents')]
})

describe('content read HTTP contracts', () => {
  it('preserves full lists by default and forwards explicit summary views', async () => {
    vi.spyOn(contentService, 'listContents').mockResolvedValue({ items: [], pagination: { total: 0 } })
    expect((await app.inject('/contents')).statusCode).toBe(200)
    expect(contentService.listContents).toHaveBeenLastCalledWith(expect.objectContaining({ tenantId, view: 'full' }))
    expect((await app.inject('/contents?view=summary&page=2&limit=10')).statusCode).toBe(200)
    expect(contentService.listContents).toHaveBeenLastCalledWith(expect.objectContaining({
      tenantId,
      view: 'summary',
      pagination: { page: 2, limit: 10 },
    }))
  })

  it.each(['view=invalid', 'limit=101', 'page=1.5', 'page=0', `categoryName=${'a'.repeat(201)}`])('rejects invalid list options before the service: %s', async (query) => {
    vi.spyOn(contentService, 'listContents').mockResolvedValue({ items: [] })
    expect((await app.inject(`/contents?${query}`)).statusCode).toBe(400)
    expect(contentService.listContents).not.toHaveBeenCalled()
  })

  it('responds with 400 to invalid reference IDs instead of listing all content', async () => {
    const result = await app.inject('/contents?category=not-an-id')
    expect(result.statusCode).toBe(400)
    expect(result.json().error).toBe('ContentListFailed')
    expect(result.json().message).toContain('valid IDs')
  })

  it('retains public custom fields only for token lists even with full bodies', async () => {
    const pagination = { page: 1, limit: 20, total: 1, pages: 1 }
    vi.spyOn(contentService, 'listContents').mockResolvedValue({
      items: [{ _id: contentId, html: '<p>Body</p>', lexical: { root: {} }, customFields: { publicKey: 'visible', privateKey: 'hidden' } }],
      pagination,
    })
    vi.spyOn(common.CustomFieldDefinition, 'find').mockReturnValue({
      select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([{ key: 'publicKey' }]),
    })
    const result = await app.inject({ url: '/contents?view=full', headers: { 'x-test-auth-type': 'api_token' } })
    expect(result.statusCode).toBe(200)
    expect(result.json()).toEqual({
      items: [{ _id: contentId, html: '<p>Body</p>', lexical: { root: {} }, customFields: { publicKey: 'visible' } }],
      pagination,
    })
  })

  it('forwards independent version pages and preserves version response metadata', async () => {
    const payload = {
      versions: [], deletedVersions: [], deletionLog: [],
      pagination: { page: 2, limit: 5, total: 12, pages: 3 },
      deletedPagination: { page: 3, limit: 5, total: 13, pages: 3 },
      hasPublishedVersion: true,
    }
    vi.spyOn(contentService, 'listVersions').mockResolvedValue(payload)
    const result = await app.inject(`/contents/${contentId}/versions?page=2&deletedPage=3&limit=5`)
    expect(result.statusCode).toBe(200)
    expect(result.json()).toEqual(payload)
    expect(contentService.listVersions).toHaveBeenCalledWith({ tenantId, contentId, pagination: { page: 2, deletedPage: 3, limit: 5 } })
  })

  it('returns full selected snapshots and filters private custom fields for API tokens', async () => {
    vi.spyOn(contentService, 'getContentVersion').mockResolvedValue({
      _id: versionId, html: '<p>Previous body</p>', lexical: { root: {} }, customFields: { publicKey: 'visible', privateKey: 'hidden' },
    })
    vi.spyOn(common.CustomFieldDefinition, 'find').mockReturnValue({
      select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([{ key: 'publicKey' }]),
    })
    const url = `/contents/${contentId}/versions/${versionId}`
    const publicResponse = await app.inject({ url, headers: { 'x-test-auth-type': 'api_token' } })
    expect(publicResponse.statusCode).toBe(200)
    expect(publicResponse.json().version).toEqual({
      _id: versionId, html: '<p>Previous body</p>', lexical: { root: {} }, customFields: { publicKey: 'visible' },
    })
    expect(contentService.getContentVersion).toHaveBeenCalledWith({ tenantId, contentId, versionId })
    const editorResponse = await app.inject(url)
    expect(editorResponse.json().version.customFields).toEqual({ publicKey: 'visible', privateKey: 'hidden' })
  })

  it('validates snapshot IDs and returns 404 for a missing or foreign snapshot', async () => {
    vi.spyOn(contentService, 'getContentVersion').mockRejectedValue(new Error('Content version not found'))
    expect((await app.inject(`/contents/${contentId}/versions/invalid`)).statusCode).toBe(400)
    expect(contentService.getContentVersion).not.toHaveBeenCalled()
    const result = await app.inject(`/contents/${contentId}/versions/${versionId}`)
    expect(result.statusCode).toBe(404)
    expect(result.json().error).toBe('ContentVersionNotFound')
  })
})
