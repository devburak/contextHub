import { afterEach, describe, expect, it, vi } from 'vitest';
import galleryService from './galleryService.js';
import { Gallery, Media } from '@contexthub/common';

const galleryId = '64b000000000000000000001';
const mediaId = '64b000000000000000000002';
const tenantId = '64b000000000000000000003';

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
