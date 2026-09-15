import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const mongoose = require('mongoose')
const common = require('@contexthub/common')
const contentService = require('./contentService')
const tenantId = '64b000000000000000000001'
const contentId = '64b000000000000000000002'
const versionId = '64b000000000000000000003'

function queryResult(value) {
  const query = { lean: vi.fn().mockResolvedValue(value) }
  for (const method of ['select', 'sort', 'skip', 'limit', 'populate']) {
    query[method] = vi.fn().mockReturnValue(query)
  }
  return query
}

function mockContentList(items = []) {
  const query = queryResult(items)
  vi.spyOn(common.Content, 'find').mockReturnValue(query)
  vi.spyOn(common.Content, 'countDocuments').mockResolvedValue(items.length)
  return query
}

afterEach(() => vi.restoreAllMocks())

describe('content list read contracts', () => {
  it('projects bodies out by default while retaining metadata and stable pagination', async () => {
    const item = { _id: contentId, title: 'Title', customFields: { region: 'TR' }, categories: [], tags: [] }
    const query = mockContentList([item])
    const result = await contentService.listContents({ tenantId, pagination: { page: 2, limit: 10 } })

    expect(common.Content.find).toHaveBeenCalledWith({ tenantId })
    expect(common.Content.countDocuments).toHaveBeenCalledWith({ tenantId })
    expect(query.select).toHaveBeenCalledWith({ html: 0, lexical: 0 })
    expect(query.sort).toHaveBeenCalledWith({ publishedAt: -1, _id: -1 })
    expect(query.skip).toHaveBeenCalledWith(10)
    expect(query.limit).toHaveBeenCalledWith(10)
    expect(result).toEqual({ items: [item], pagination: { page: 2, limit: 10, total: 1, pages: 1 } })
  })

  it('retains explicit full-list body compatibility and caps the service limit', async () => {
    const item = { _id: contentId, html: '<p>Body</p>', lexical: { root: {} } }
    const query = mockContentList([item])
    const result = await contentService.listContents({ tenantId, view: 'full', pagination: { limit: 1000 } })
    expect(query.select).not.toHaveBeenCalled()
    expect(query.limit).toHaveBeenCalledWith(100)
    expect(result.items).toEqual([item])
    expect(result.pagination.limit).toBe(100)
  })

  it.each([
    { view: 'unknown' },
    { pagination: { page: 0 } },
    { pagination: { page: 1.5 } },
    { pagination: { page: Number.MAX_SAFE_INTEGER, limit: 100 } },
    { pagination: { limit: Number.NaN } },
  ])('rejects invalid list options before a database read: %j', async (options) => {
    mockContentList()
    await expect(contentService.listContents({ tenantId, ...options })).rejects.toThrow()
    expect(common.Content.find).not.toHaveBeenCalled()
  })

  it.each(['category', 'categories', 'tag'])('rejects invalid %s IDs instead of broadening the query', async (field) => {
    mockContentList()
    await expect(contentService.listContents({ tenantId, filters: { [field]: `${contentId},invalid` } })).rejects.toThrow('valid IDs')
    expect(common.Content.find).not.toHaveBeenCalled()
    expect(common.Content.countDocuments).not.toHaveBeenCalled()
  })

  it.each([
    ['categoryName', 'Category'],
    ['tagName', 'Tag'],
  ])('returns an empty page without a content scan when %s does not match', async (field, model) => {
    mockContentList()
    vi.spyOn(common[model], 'find').mockReturnValue(queryResult([]))
    const result = await contentService.listContents({ tenantId, filters: { [field]: 'no matches' }, pagination: { page: 3, limit: 7 } })
    expect(result).toEqual({ items: [], pagination: { page: 3, limit: 7, total: 0, pages: 1 } })
    expect(common.Content.find).not.toHaveBeenCalled()
    expect(common.Content.countDocuments).not.toHaveBeenCalled()
  })

  it('preserves category ID-or-name matching and searches names as literal substrings', async () => {
    mockContentList()
    const matchedId = new mongoose.Types.ObjectId()
    vi.spyOn(common.Category, 'find').mockReturnValue(queryResult([{ _id: matchedId }]))
    vi.spyOn(common.Tag, 'find').mockReturnValue(queryResult([]))
    await contentService.listContents({
      tenantId,
      filters: { category: contentId, categoryName: 'a+b[', tag: versionId, tagName: 'a+b[' },
    })
    const categoryQuery = common.Category.find.mock.calls[0][0]
    expect(categoryQuery.tenantId).toBe(tenantId)
    expect(categoryQuery.name.test('prefix A+B[ suffix')).toBe(true)
    expect(categoryQuery.name.test('aaab')).toBe(false)
    const tagQuery = common.Tag.find.mock.calls[0][0]
    expect(tagQuery.tenantId).toBe(tenantId)
    for (const clause of tagQuery.$or) {
      expect(Object.values(clause)[0].test('prefix A+B[ suffix')).toBe(true)
      expect(Object.values(clause)[0].test('aaab')).toBe(false)
    }
    expect(common.Content.find).toHaveBeenCalledWith({
      tenantId,
      categories: { $in: [new mongoose.Types.ObjectId(contentId), matchedId] },
      tags: { $in: [new mongoose.Types.ObjectId(versionId)] },
    })
  })

  it.each(['', '   ', 'a'.repeat(201)])('rejects blank or excessive name filters', async (name) => {
    mockContentList()
    await expect(contentService.listContents({ tenantId, filters: { categoryName: name } })).rejects.toThrow('200 characters')
    expect(common.Content.find).not.toHaveBeenCalled()
  })

  it('preserves API-token public custom-field filtering and pagination for either view', async () => {
    const query = queryResult([{ key: 'publicField' }])
    vi.spyOn(common.CustomFieldDefinition, 'find').mockReturnValue(query)
    const pagination = { page: 1, limit: 20, total: 1, pages: 1 }
    const result = await contentService.filterPublicCustomFieldsInList({ tenantId, result: {
      items: [{ title: 'Title', html: '<p>Body</p>', customFields: { publicField: 'visible', privateField: 'hidden' } }],
      pagination,
    } })
    expect(common.CustomFieldDefinition.find).toHaveBeenCalledWith({ tenantId, public: true })
    expect(result.pagination).toEqual(pagination)
    expect(result.items[0]).toEqual({ title: 'Title', html: '<p>Body</p>', customFields: { publicField: 'visible' } })
  })
})

describe('content version read contracts', () => {
  it('returns independently paged metadata and detects published history outside the current page', async () => {
    const active = queryResult([{ _id: versionId, version: 40, title: 'Recent draft', status: 'draft' }])
    const deleted = queryResult([{ _id: new mongoose.Types.ObjectId(), version: 10, deletedByName: 'Editor' }])
    vi.spyOn(common.ContentVersion, 'find').mockReturnValueOnce(active).mockReturnValueOnce(deleted)
    vi.spyOn(common.ContentVersion, 'countDocuments').mockResolvedValueOnce(40).mockResolvedValueOnce(8)
    vi.spyOn(common.ContentVersion, 'exists').mockResolvedValue({ _id: new mongoose.Types.ObjectId() })

    const result = await contentService.listVersions({ tenantId, contentId, pagination: { page: 2, deletedPage: 3, limit: 3 } })
    expect(common.ContentVersion.find).toHaveBeenNthCalledWith(1, { tenantId, contentId, deletedAt: null })
    expect(common.ContentVersion.find).toHaveBeenNthCalledWith(2, { tenantId, contentId, deletedAt: { $ne: null } })
    expect(active.skip).toHaveBeenCalledWith(3)
    expect(deleted.skip).toHaveBeenCalledWith(6)
    expect(active.limit).toHaveBeenCalledWith(3)
    expect(deleted.limit).toHaveBeenCalledWith(3)
    for (const query of [active, deleted]) {
      const fields = query.select.mock.calls[0][0].split(' ')
      expect(fields).toEqual(expect.arrayContaining(['_id', 'version', 'title', 'status', 'deletedAt', 'createdAt']))
      for (const snapshotField of ['html', 'lexical', 'customFields', 'categories', 'tags']) {
        expect(fields).not.toContain(snapshotField)
      }
    }
    expect(common.ContentVersion.exists).toHaveBeenCalledWith({ tenantId, contentId, deletedAt: null, status: 'published' })
    expect(common.ContentVersion.countDocuments).toHaveBeenNthCalledWith(1, { tenantId, contentId, deletedAt: null })
    expect(common.ContentVersion.countDocuments).toHaveBeenNthCalledWith(2, { tenantId, contentId, deletedAt: { $ne: null } })
    expect(result.pagination).toEqual({ page: 2, limit: 3, total: 40, pages: 14 })
    expect(result.deletedPagination).toEqual({ page: 3, limit: 3, total: 8, pages: 3 })
    expect(result.hasPublishedVersion).toBe(true)
    expect(result.versions[0].status).toBe('draft')
    expect(result.deletedVersions[0].deletedByDisplayName).toBe('Editor')
    expect(result.deletionLog).toHaveLength(1)
  })

  it('scopes selected full snapshots to both tenant and parent content', async () => {
    const snapshot = { _id: versionId, html: '<p>Earlier body</p>', lexical: { root: {} }, customFields: { key: 'value' } }
    const query = queryResult(snapshot)
    vi.spyOn(common.ContentVersion, 'findOne').mockReturnValue(query)
    expect(await contentService.getContentVersion({ tenantId, contentId, versionId })).toEqual(snapshot)
    expect(common.ContentVersion.findOne).toHaveBeenCalledWith({ tenantId, contentId, _id: versionId })
    expect(query.select).not.toHaveBeenCalled()
  })

  it('returns not found for a snapshot outside the tenant or content scope', async () => {
    vi.spyOn(common.ContentVersion, 'findOne').mockReturnValue(queryResult(null))
    await expect(contentService.getContentVersion({ tenantId, contentId, versionId })).rejects.toThrow('Content version not found')
  })
})
