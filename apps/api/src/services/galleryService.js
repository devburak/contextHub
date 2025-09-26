const { Gallery, Media } = require('@contexthub/common');
const mongoose = require('mongoose');

const ObjectId = mongoose.Types.ObjectId;

function normaliseObjectId(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function normaliseItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const mediaId = normaliseObjectId(item?.mediaId || item?.media?.id || item?.media?._id);
      if (!mediaId) return null;
      return {
        mediaId,
        title: item?.title?.trim() || '',
        caption: item?.caption?.trim() || '',
        order: typeof item?.order === 'number' ? item.order : index
      };
    })
    .filter(Boolean);
}

function normaliseContentIds(values = []) {
  if (!Array.isArray(values)) return [];
  return values
    .map(normaliseObjectId)
    .filter(Boolean);
}

async function attachMediaData(gallery) {
  if (!gallery || !gallery.items?.length) {
    return gallery;
  }
  const mediaIds = gallery.items.map((item) => item.mediaId).filter(Boolean);
  const uniqueIds = [...new Set(mediaIds.map((id) => id.toString()))].map((id) => new ObjectId(id));
  const mediaDocs = await Media.find({ _id: { $in: uniqueIds } }).lean();
  const mediaMap = new Map(mediaDocs.map((doc) => [doc._id.toString(), doc]));

  const items = gallery.items.map((item) => {
    const mediaDoc = mediaMap.get(item.mediaId.toString());
    return {
      mediaId: item.mediaId.toString(),
      title: item.title,
      caption: item.caption,
      order: item.order ?? 0,
      media: mediaDoc
        ? {
            id: mediaDoc._id.toString(),
            originalName: mediaDoc.originalName,
            fileName: mediaDoc.fileName,
            mimeType: mediaDoc.mimeType,
            size: mediaDoc.size,
            publicUrl: mediaDoc.publicUrl,
            variants: mediaDoc.variants || [],
            createdAt: mediaDoc.createdAt,
          }
        : null,
    };
  });

  return {
    ...gallery,
    id: gallery._id?.toString?.() || gallery.id,
    items,
    linkedContentIds: (gallery.linkedContentIds || []).map((id) => id.toString()),
    tenantId: gallery.tenantId?.toString?.() || gallery.tenantId,
    createdBy: gallery.createdBy?.toString?.() || gallery.createdBy,
    updatedBy: gallery.updatedBy?.toString?.() || gallery.updatedBy,
  };
}

class GalleryService {
  async listGalleries({ tenantId, search, contentId, page = 1, limit = 20 }) {
    const query = { tenantId };

    if (search) {
      query.title = { $regex: search.trim(), $options: 'i' };
    }

    if (contentId && ObjectId.isValid(contentId)) {
      query.linkedContentIds = new ObjectId(contentId);
    }

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    const [docs, total] = await Promise.all([
      Gallery.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      Gallery.countDocuments(query)
    ]);

    const galleries = await Promise.all(docs.map((doc) => attachMediaData(doc)));

    return {
      items: galleries,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit) || 1,
      }
    };
  }

  async getGallery({ tenantId, galleryId }) {
    if (!ObjectId.isValid(galleryId)) {
      throw new Error('Invalid gallery id');
    }

    const doc = await Gallery.findOne({ _id: galleryId, tenantId }).lean();
    if (!doc) {
      throw new Error('Gallery not found');
    }

    return attachMediaData(doc);
  }

  async createGallery({ tenantId, userId, payload }) {
    const title = payload?.title?.trim();
    if (!title) {
      throw new Error('Gallery title is required');
    }

    const items = normaliseItems(payload.items);
    const linkedContentIds = normaliseContentIds(payload.linkedContentIds);
    const description = payload?.description?.trim() || '';
    const status = payload?.status === 'published' ? 'published' : 'draft';

    const doc = await Gallery.create({
      tenantId,
      title,
      description,
      items,
      linkedContentIds,
      status,
      createdBy: normaliseObjectId(userId),
      updatedBy: normaliseObjectId(userId)
    });

    return this.getGallery({ tenantId, galleryId: doc._id });
  }

  async updateGallery({ tenantId, galleryId, userId, payload }) {
    if (!ObjectId.isValid(galleryId)) {
      throw new Error('Invalid gallery id');
    }

    const update = {};

    if (payload.title !== undefined) {
      const title = payload.title?.trim();
      if (!title) {
        throw new Error('Gallery title cannot be empty');
      }
      update.title = title;
    }

    if (payload.description !== undefined) {
      update.description = payload.description?.trim() || '';
    }

    if (payload.items !== undefined) {
      update.items = normaliseItems(payload.items);
    }

    if (payload.linkedContentIds !== undefined) {
      update.linkedContentIds = normaliseContentIds(payload.linkedContentIds);
    }

    if (payload.status !== undefined) {
      update.status = payload.status === 'published' ? 'published' : 'draft';
    }

    if (userId) {
      update.updatedBy = normaliseObjectId(userId);
    }

    const result = await Gallery.findOneAndUpdate(
      { _id: galleryId, tenantId },
      { $set: update },
      { new: true }
    ).lean();

    if (!result) {
      throw new Error('Gallery not found');
    }

    return attachMediaData(result);
  }

  async deleteGallery({ tenantId, galleryId }) {
    if (!ObjectId.isValid(galleryId)) {
      throw new Error('Invalid gallery id');
    }

    await Gallery.deleteOne({ _id: galleryId, tenantId });
    return { success: true };
  }

  async listByContent({ tenantId, contentId }) {
    if (!ObjectId.isValid(contentId)) {
      throw new Error('Invalid content id');
    }
    const result = await this.listGalleries({ tenantId, contentId, page: 1, limit: 100 });
    return result.items;
  }

  async setGalleriesForContent({ tenantId, contentId, galleryIds }) {
    if (!ObjectId.isValid(contentId)) {
      throw new Error('Invalid content id');
    }

    const contentObjectId = new ObjectId(contentId);
    const targetIds = (Array.isArray(galleryIds) ? galleryIds : [])
      .map(normaliseObjectId)
      .filter(Boolean);

    await Gallery.updateMany(
      { tenantId, linkedContentIds: contentObjectId },
      { $pull: { linkedContentIds: contentObjectId } }
    );

    if (targetIds.length) {
      await Gallery.updateMany(
        { tenantId, _id: { $in: targetIds } },
        { $addToSet: { linkedContentIds: contentObjectId } }
      );
    }

    return this.listByContent({ tenantId, contentId });
  }
}

module.exports = new GalleryService();
