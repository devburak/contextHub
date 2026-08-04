import { describe, expect, it, vi } from 'vitest'

import {
  ExtensionSourceFacadeError,
  createExtensionSourceFacade
} from './extensionSourceFacade'

describe('extension source facade', () => {
  it('returns a tenant-scoped content snapshot with labels and field definitions', async () => {
    const loadContent = vi.fn().mockResolvedValue({
      _id: 'content-1',
      tenantId: 'tenant-1',
      status: 'published',
      title: 'Başlık',
      summary: 'Özet',
      html: '<p>Gövde</p>',
      lexical: { root: { children: [] } },
      categories: [{ name: 'Haber', description: 'not exposed' }],
      tags: [{ title: new Map([['tr', 'Güncel']]) }],
      customFields: { audience: 'members', privateNote: 'policy must reject this' },
      version: 7,
      updatedAt: new Date('2026-08-04T10:00:00Z')
    })
    const loadContentDefinitions = vi.fn().mockResolvedValue([
      {
        key: 'audience',
        type: 'select',
        public: false,
        searchable: false,
        filterable: true,
        description: 'not exposed',
        options: [{ label: 'Üyeler', value: 'members' }]
      }
    ])
    const sources = createExtensionSourceFacade({
      loadContent,
      loadContentDefinitions,
      loadCollectionEntry: vi.fn()
    })

    const snapshot = await sources.getContentSnapshot({
      tenantId: 'tenant-1',
      contentId: 'content-1'
    })

    expect(loadContent).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      contentId: 'content-1'
    })
    expect(loadContentDefinitions).toHaveBeenCalledWith({ tenantId: 'tenant-1' })
    expect(snapshot).toMatchObject({
      tenantId: 'tenant-1',
      id: 'content-1',
      status: 'published',
      title: 'Başlık',
      categories: [{ name: 'Haber' }],
      tags: [{ title: 'Güncel' }],
      customFields: { audience: 'members', privateNote: 'policy must reject this' },
      customFieldDefinitions: [{
        key: 'audience',
        type: 'select',
        public: false,
        searchable: false,
        filterable: true,
        options: [{ label: 'Üyeler', value: 'members' }]
      }]
    })
    expect(snapshot.categories[0]).not.toHaveProperty('description')
    expect(snapshot.customFieldDefinitions[0]).not.toHaveProperty('description')
    expect(Object.isFrozen(snapshot)).toBe(true)
  })

  it('returns a plain collection entry snapshot without filtering lifecycle status', async () => {
    const loadCollectionEntry = vi.fn().mockResolvedValue({
      _id: 'entry-1',
      tenantId: 'tenant-1',
      collectionKey: 'authors',
      status: 'draft',
      data: { name: 'Ada' },
      dataLabels: { role: { tr: 'Yazar' } },
      relations: { contents: ['not exposed'] },
      updatedAt: new Date('2026-08-04T10:00:00Z')
    })
    const sources = createExtensionSourceFacade({
      loadContent: vi.fn(),
      loadContentDefinitions: vi.fn(),
      loadCollectionEntry
    })

    const snapshot = await sources.getCollectionEntrySnapshot({
      tenantId: 'tenant-1',
      collectionKey: 'authors',
      entryId: 'entry-1'
    })

    expect(loadCollectionEntry).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      collectionKey: 'authors',
      entryId: 'entry-1'
    })
    expect(snapshot).toEqual({
      tenantId: 'tenant-1',
      id: 'entry-1',
      collectionKey: 'authors',
      status: 'draft',
      data: { name: 'Ada' },
      dataLabels: { role: { tr: 'Yazar' } },
      updatedAt: new Date('2026-08-04T10:00:00Z')
    })
  })

  it('returns null for a missing source and fails closed on an incomplete identity', async () => {
    const loadContentDefinitions = vi.fn()
    const sources = createExtensionSourceFacade({
      loadContent: vi.fn().mockResolvedValue(null),
      loadContentDefinitions,
      loadCollectionEntry: vi.fn().mockResolvedValue(null)
    })

    await expect(sources.getContentSnapshot({
      tenantId: 'tenant-1',
      contentId: 'missing'
    })).resolves.toBeNull()
    expect(loadContentDefinitions).not.toHaveBeenCalled()
    await expect(sources.getCollectionEntrySnapshot({
      tenantId: 'tenant-1',
      collectionKey: 'authors',
      entryId: 'missing'
    })).resolves.toBeNull()
    await expect(sources.getContentSnapshot({ tenantId: 'tenant-1' }))
      .rejects.toBeInstanceOf(ExtensionSourceFacadeError)
  })
})
