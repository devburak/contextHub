import { describe, expect, it, vi } from 'vitest'
import mongoose from 'mongoose'

import { createExtensionRestoreFacade } from './extensionRestoreFacade'

const TENANT_ID = '6a1702eddffc9f11747a4205'
const DOCUMENT_ID = '6a1702eddffc9f11747a4210'

describe('extension restore facade', () => {
  it('writes only an allow-listed tenant document without user references', async () => {
    const collection = {
      findOne: vi.fn().mockResolvedValue(null),
      replaceOne: vi.fn().mockResolvedValue({ upsertedCount: 1 }),
      deleteOne: vi.fn(),
      countDocuments: vi.fn().mockResolvedValue(0)
    }
    const facade = createExtensionRestoreFacade({
      connection: { db: { collection: vi.fn(() => collection) } },
      tenantModel: tenantModel(),
      media: () => mediaFacade()
    })
    const document = mongoose.mongo.BSON.EJSON.serialize({
      _id: new mongoose.Types.ObjectId(DOCUMENT_ID),
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      title: 'Restored'
    }, { relaxed: false })

    await expect(facade.upsert({
      collection: 'contents',
      id: DOCUMENT_ID,
      tenantId: TENANT_ID,
      document
    })).resolves.toEqual({ upserted: 1 })
    expect(collection.replaceOne).toHaveBeenCalledWith(
      { _id: new mongoose.Types.ObjectId(DOCUMENT_ID) },
      expect.objectContaining({ title: 'Restored' }),
      { upsert: true }
    )
  })

  it('rejects identity collections and user references at the core boundary', async () => {
    const facade = createExtensionRestoreFacade({
      connection: { db: { collection: vi.fn() } },
      tenantModel: tenantModel(),
      media: () => mediaFacade()
    })
    await expect(facade.findPopulatedCollections({
      tenantId: TENANT_ID,
      collections: ['users']
    })).rejects.toMatchObject({ code: 'EXTENSION_RESTORE_COLLECTION_FORBIDDEN' })

    const document = mongoose.mongo.BSON.EJSON.serialize({
      _id: new mongoose.Types.ObjectId(DOCUMENT_ID),
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      createdBy: new mongoose.Types.ObjectId('6a1702eddffc9f11747a4300')
    }, { relaxed: false })
    await expect(facade.upsert({
      collection: 'contents',
      id: DOCUMENT_ID,
      tenantId: TENANT_ID,
      document
    })).rejects.toMatchObject({ code: 'EXTENSION_RESTORE_USER_REFERENCE_FORBIDDEN' })
  })

  it('uses the running media service without exposing its credentials', async () => {
    const media = mediaFacade()
    const facade = createExtensionRestoreFacade({
      connection: { db: { collection: vi.fn() } },
      tenantModel: tenantModel(),
      media: () => media
    })
    await expect(facade.getMediaTarget({ tenantId: TENANT_ID })).resolves.toEqual({
      bucket: 'runtime-media',
      publicDomain: 'https://media.example.test',
      tenantSlug: 'tenant-a'
    })
    await facade.putFile({
      tenantId: TENANT_ID,
      key: 'tenant-a/file.jpg',
      body: Buffer.from('file'),
      contentType: 'image/jpeg',
      contentLength: 4
    })
    expect(media.putTenantRestoreFile).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: TENANT_ID,
      key: 'tenant-a/file.jpg'
    }))
    expect(facade).not.toHaveProperty('credentials')
  })
})

function tenantModel() {
  return {
    findById: vi.fn(() => ({
      select: vi.fn(() => ({
        lean: vi.fn().mockResolvedValue({ _id: TENANT_ID, slug: 'tenant-a', status: 'active' })
      }))
    }))
  }
}

function mediaFacade() {
  return {
    getTenantRestoreTarget: vi.fn(() => ({
      bucket: 'runtime-media',
      publicDomain: 'https://media.example.test'
    })),
    putTenantRestoreFile: vi.fn().mockResolvedValue({ key: 'tenant-a/file.jpg', bytes: 4 }),
    deleteTenantRestoreFile: vi.fn().mockResolvedValue({ key: 'tenant-a/file.jpg', deleted: true })
  }
}
