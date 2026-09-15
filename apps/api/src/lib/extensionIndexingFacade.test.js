import { describe, expect, it, vi } from 'vitest'
import { createExtensionIndexingFacade } from './extensionIndexingFacade'

const tenantId = '6a9dc1a3ecfb2c138c50a50e'
const after = '6a9dc1a3ecfb2c138c50a510'
function model(rows) {
  const query = { select: vi.fn().mockReturnThis(), sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue(rows) }
  return { find: vi.fn(() => query), query }
}

describe('extension indexing facade', () => {
  it('uses tenant-scoped keyset pagination and includes unpublished sources for index cleanup', async () => {
    const content = model([
      { _id: '6a9dc1a3ecfb2c138c50a511', tenantId },
      { _id: '6a9dc1a3ecfb2c138c50a512', tenantId }
    ])
    const entries = model([])
    const facade = createExtensionIndexingFacade({ contentModel: content, entryModel: entries })
    const page = await facade.scanSources({ tenantId, sourceType: 'content', after, limit: 1 })
    expect(content.find).toHaveBeenCalledWith({ tenantId, _id: { $gt: after } })
    expect(content.query.limit).toHaveBeenCalledWith(2)
    expect(page).toEqual({ items: [{ sourceId: '6a9dc1a3ecfb2c138c50a511', sourceType: 'content' }], hasMore: true })
    expect(entries.find).not.toHaveBeenCalled()
  })

  it('scans collection identities and preserves collection keys without exposing data fields', async () => {
    const entries = model([{ _id: after, tenantId, collectionKey: 'authors', data: { secret: 'hidden' } }])
    const facade = createExtensionIndexingFacade({ entryModel: entries })
    expect(await facade.scanSources({ tenantId, sourceType: 'collectionEntry' })).toEqual({
      items: [{ sourceId: after, sourceType: 'collectionEntry', collectionKey: 'authors' }], hasMore: false
    })
    expect(entries.find).toHaveBeenCalledWith({ tenantId })
    expect(entries.query.select).toHaveBeenCalledWith('_id tenantId collectionKey')
  })

  it('rejects malformed scopes, cursors, limits and tenant boundary violations', async () => {
    const content = model([{ _id: after, tenantId: 'another-tenant' }])
    const facade = createExtensionIndexingFacade({ contentModel: content })
    for (const invalid of [{ tenantId: {} }, { after: { $gt: '' } }, { limit: 101 }, { sourceType: 'users' }]) {
      await expect(facade.scanSources({ tenantId, sourceType: 'content', ...invalid })).rejects.toThrow()
    }
    expect(content.find).not.toHaveBeenCalled()
    await expect(facade.scanSources({ tenantId, sourceType: 'content' })).rejects.toThrow('boundary')
  })

  it('reserves monotonic sequences without inserting synthetic source mutation events', async () => {
    const allocateSequence = vi.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(11)
    const facade = createExtensionIndexingFacade({ allocateSequence })
    expect(await facade.allocateSequence({ tenantId })).toBe(10)
    expect(await facade.allocateSequence({ tenantId })).toBe(11)
    await expect(facade.allocateSequence({ tenantId: '' })).rejects.toThrow()
    expect(allocateSequence).toHaveBeenCalledTimes(2)
  })
})
