import { afterEach, describe, expect, it, vi } from 'vitest';
import galleryService from './galleryService.js';
import { Gallery, Media } from '@contexthub/common';

const galleryId = '64b000000000000000000001';
const mediaId = '64b000000000000000000002';
const tenantId = '64b000000000000000000003';
const contentId = '64b000000000000000000004';
const secondGalleryId = '64b000000000000000000005';
const missingMediaId = '64b000000000000000000006';

function mockGalleryList(docs) {
  const query = {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(docs)
  };
  vi.spyOn(Gallery, 'find').mockReturnValue(query);
  return query;
}

describe('galleryService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes an empty gallery with a stable id so it can be selected for editing', async () => {
    vi.spyOn(Gallery, 'findOne').mockReturnValue({
      lean: () => Promise.resolve({
        _id: galleryId,
        tenantId,
        title: 'Kareler',
        status: 'draft',
        items: [],
        linkedContentIds: []
      })
    });
    const mediaFindSpy = vi.spyOn(Media, 'find');

    const result = await galleryService.getGallery({ tenantId, galleryId });

    expect(result.id).toBe(galleryId);
    expect(result.items).toEqual([]);
    expect(result.tenantId).toBe(tenantId);
    expect(mediaFindSpy).not.toHaveBeenCalled();
  });

  it('returns thumbnail and media fields needed by the gallery editor', async () => {
    vi.spyOn(Gallery, 'findOne').mockReturnValue({
      lean: () => Promise.resolve({
        _id: galleryId,
        tenantId,
        title: 'Kareler',
        status: 'published',
        items: [{ mediaId, title: '', caption: '', order: 0 }],
        linkedContentIds: []
      })
    });
    vi.spyOn(Media, 'find').mockReturnValue({
      lean: () => Promise.resolve([{
        _id: mediaId,
        tenantId,
        originalName: 'kare.jpg',
        fileName: 'kare.jpg',
        mimeType: 'image/jpeg',
        url: 'https://cdn.example/kare.jpg',
        sourceType: 'upload',
        thumbnailUrl: null,
        variants: [{ name: 'thumbnail', url: 'https://cdn.example/thumb.jpg' }]
      }])
    });

    const result = await galleryService.getGallery({ tenantId, galleryId });

    expect(Media.find).toHaveBeenCalledWith(expect.objectContaining({ tenantId }));
    expect(result.items[0].media).toMatchObject({
      id: mediaId,
      url: 'https://cdn.example/kare.jpg',
      publicUrl: 'https://cdn.example/kare.jpg',
      sourceType: 'upload',
      variants: [{ name: 'thumbnail', url: 'https://cdn.example/thumb.jpg' }]
    });
  });

  it('loads content galleries without counting and batches tenant-scoped media while preserving item order', async () => {
    const docs = [{
      _id: galleryId,
      tenantId,
      title: 'First gallery',
      items: [
        { mediaId, title: 'Second', caption: 'Shared media', order: 2 },
        { mediaId: missingMediaId, title: 'First', caption: 'Missing media', order: 1 }
      ],
      linkedContentIds: [contentId]
    }, {
      _id: secondGalleryId,
      tenantId,
      title: 'Second gallery',
      items: [{ mediaId, title: 'Shared again', caption: '', order: 0 }],
      linkedContentIds: [contentId]
    }];
    const query = mockGalleryList(docs);
    const countSpy = vi.spyOn(Gallery, 'countDocuments').mockResolvedValue(2);
    const mediaSpy = vi.spyOn(Media, 'find').mockReturnValue({
      lean: () => Promise.resolve([{ _id: mediaId, tenantId, url: 'https://cdn.example/shared.jpg' }])
    });

    const result = await galleryService.listByContent({ tenantId, contentId });

    expect(Gallery.find).toHaveBeenCalledTimes(1);
    const filter = Gallery.find.mock.calls[0][0];
    expect(filter.tenantId).toBe(tenantId);
    expect(filter.linkedContentIds.toString()).toBe(contentId);
    expect(query.sort).toHaveBeenCalledWith({ updatedAt: -1 });
    expect(query.limit).toHaveBeenCalledWith(100);
    expect(countSpy).not.toHaveBeenCalled();
    expect(mediaSpy).toHaveBeenCalledTimes(1);
    const mediaFilter = mediaSpy.mock.calls[0][0];
    expect(mediaFilter.tenantId).toBe(tenantId);
    expect(mediaFilter._id.$in.map(String)).toEqual([missingMediaId, mediaId]);
    expect(result.map((gallery) => gallery.id)).toEqual([galleryId, secondGalleryId]);
    expect(result[0].linkedContentIds).toEqual([contentId]);
    expect(result[0].items).toEqual([
      { mediaId: missingMediaId, title: 'First', caption: 'Missing media', order: 1, media: null },
      expect.objectContaining({ mediaId, title: 'Second', caption: 'Shared media', order: 2,
        media: expect.objectContaining({ id: mediaId, publicUrl: 'https://cdn.example/shared.jpg' }) })
    ]);
    expect(result[1].items[0].media.id).toBe(mediaId);
    expect(docs[0].items.map((item) => item.order)).toEqual([2, 1]);
  });

  it('keeps admin pagination totals and fetches media once across its gallery page', async () => {
    const query = mockGalleryList([{
      _id: galleryId, tenantId, items: [{ mediaId, order: 0 }]
    }, {
      _id: secondGalleryId, tenantId, items: [{ mediaId, order: 0 }]
    }]);
    vi.spyOn(Gallery, 'countDocuments').mockResolvedValue(7);
    const mediaSpy = vi.spyOn(Media, 'find').mockReturnValue({
      lean: () => Promise.resolve([{ _id: mediaId, tenantId }])
    });

    const result = await galleryService.listGalleries({ tenantId, page: 2, limit: 2 });

    expect(Gallery.find).toHaveBeenCalledWith({ tenantId });
    expect(Gallery.countDocuments).toHaveBeenCalledWith({ tenantId });
    expect(query.skip).toHaveBeenCalledWith(2);
    expect(query.limit).toHaveBeenCalledWith(2);
    expect(mediaSpy).toHaveBeenCalledTimes(1);
    expect(mediaSpy.mock.calls[0][0].tenantId).toBe(tenantId);
    expect(mediaSpy.mock.calls[0][0]._id.$in.map(String)).toEqual([mediaId]);
    expect(result.items).toHaveLength(2);
    expect(result.pagination).toEqual({ page: 2, limit: 2, total: 7, pages: 4 });
  });

  it.each([
    { name: 'no linked galleries', docs: [], expected: [] },
    { name: 'an empty linked gallery', docs: [{ _id: galleryId, tenantId, items: [] }], expected: [galleryId] }
  ])('skips media and count queries for $name', async ({ docs, expected }) => {
    mockGalleryList(docs);
    const mediaSpy = vi.spyOn(Media, 'find').mockReturnValue({ lean: () => Promise.resolve([]) });
    const countSpy = vi.spyOn(Gallery, 'countDocuments').mockResolvedValue(0);

    const result = await galleryService.listByContent({ tenantId, contentId });

    expect(result.map((gallery) => gallery.id)).toEqual(expected);
    expect(result.every((gallery) => gallery.items.length === 0)).toBe(true);
    expect(mediaSpy).not.toHaveBeenCalled();
    expect(countSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid content id before reading galleries', async () => {
    mockGalleryList([]);

    await expect(galleryService.listByContent({ tenantId, contentId: 'invalid' }))
      .rejects.toThrow('Invalid content id');

    expect(Gallery.find).not.toHaveBeenCalled();
  });

  it('deletes a draft gallery without deleting media records', async () => {
    vi.spyOn(Gallery, 'findOne').mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ _id: galleryId, status: 'draft' })
      })
    });
    const deleteGallerySpy = vi.spyOn(Gallery, 'deleteOne').mockResolvedValue({ deletedCount: 1 });

    await expect(galleryService.deleteGallery({ tenantId, galleryId })).resolves.toEqual({ success: true });

    expect(deleteGallerySpy).toHaveBeenCalledWith({ _id: galleryId, tenantId, status: 'draft' });
  });

  it('rejects deletion while a gallery is published', async () => {
    vi.spyOn(Gallery, 'findOne').mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ _id: galleryId, status: 'published' })
      })
    });
    const deleteGallerySpy = vi.spyOn(Gallery, 'deleteOne');

    await expect(galleryService.deleteGallery({ tenantId, galleryId })).rejects.toMatchObject({
      code: 'GALLERY_MUST_BE_DRAFT',
      statusCode: 409
    });
    expect(deleteGallerySpy).not.toHaveBeenCalled();
  });
});
