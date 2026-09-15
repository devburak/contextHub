import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mongoose = require('mongoose');
const common = require('@contexthub/common');
const collectionTypeService = require('./collectionTypeService');

let collectionEntryService;
let getCollectionTypeSpy;

function listQueryResult(items) {
  return {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(items),
  };
}

function selectedQueryResult(items) {
  return {
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(items),
    }),
  };
}

beforeEach(() => {
  getCollectionTypeSpy = vi.spyOn(collectionTypeService, 'getCollectionType');
  delete require.cache[require.resolve('./collectionEntryService')];
  collectionEntryService = require('./collectionEntryService');
  getCollectionTypeSpy.mockResolvedValue({
    fields: [],
    settings: {},
    toObject() {
      return { fields: this.fields, settings: this.settings };
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('collection entry tenant boundaries', () => {
  it('forces every public DSL base query to published entries', async () => {
    const findSpy = vi.spyOn(common.CollectionEntry, 'find').mockReturnValue(listQueryResult([]));
    vi.spyOn(common.CollectionEntry, 'countDocuments').mockResolvedValue(0);

    await collectionEntryService.runCollectionQuery({
      tenantId: '64b000000000000000000001',
      payload: { collection: 'people', limit: 20 },
    });

    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: '64b000000000000000000001',
      collectionKey: 'people',
      status: 'published',
    }));
    expect(common.CollectionEntry.countDocuments).toHaveBeenCalledWith(expect.objectContaining({
      status: 'published',
    }));
  });

  it('scopes expanded refs, media and content to the tenant and public state', async () => {
    const tenantId = '64b000000000000000000001';
    const entryId = new mongoose.Types.ObjectId();
    const refId = new mongoose.Types.ObjectId();
    const mediaId = new mongoose.Types.ObjectId();
    const contentId = new mongoose.Types.ObjectId();

    getCollectionTypeSpy.mockResolvedValue({
      fields: [
        { key: 'author', type: 'ref', ref: 'people', settings: {} },
        { key: 'image', type: 'media', settings: {} },
      ],
      settings: {},
      toObject() {
        return { fields: this.fields, settings: this.settings };
      },
    });

    const entry = {
      _id: entryId,
      data: { author: refId, image: mediaId },
      relations: { media: [mediaId], contents: [contentId] },
    };
    const entryFindSpy = vi.spyOn(common.CollectionEntry, 'find').mockImplementation((query) => {
      if (query.collectionKey) return listQueryResult([entry]);
      return { lean: vi.fn().mockResolvedValue([]) };
    });
    vi.spyOn(common.CollectionEntry, 'countDocuments').mockResolvedValue(1);
    const mediaFindSpy = vi.spyOn(common.Media, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    const contentFindSpy = vi.spyOn(common.Content, 'find').mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });

    await collectionEntryService.runCollectionQuery({
      tenantId,
      payload: {
        collection: 'articles',
        select: ['author.slug', 'image.url', 'relations.media.url', 'relations.contents.title'],
      },
    });

    expect(entryFindSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      tenantId,
      status: 'published',
    }));
    expect(mediaFindSpy).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      status: 'active',
      isPublic: { $ne: false },
    }));
    expect(contentFindSpy).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      status: 'published',
    }));
  });

  it('rejects cross-tenant field references before creating an entry', async () => {
    const foreignRefId = new mongoose.Types.ObjectId();
    getCollectionTypeSpy.mockResolvedValue({
      fields: [{ key: 'author', type: 'ref', ref: 'people', settings: {} }],
      settings: {},
    });

    vi.spyOn(common.CollectionEntry, 'find').mockReturnValue(selectedQueryResult([]));
    const createSpy = vi.spyOn(common.CollectionEntry, 'create');

    await expect(collectionEntryService.createEntry({
      tenantId: '64b000000000000000000001',
      collectionKey: 'articles',
      payload: { data: { author: foreignRefId.toString() } },
      userId: new mongoose.Types.ObjectId().toString(),
    })).rejects.toMatchObject({
      code: 'EntryValidationFailed',
      details: expect.arrayContaining([expect.objectContaining({ field: 'author' })]),
    });

    expect(createSpy).not.toHaveBeenCalled();
  });
});
