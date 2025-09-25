const { Content, ContentVersion } = require('@contexthub/common')
const mongoose = require('mongoose')

const ObjectId = mongoose.Types.ObjectId

function slugify(value) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function slugExists({ tenantId, slug, excludeId }) {
  const query = { tenantId, slug }
  if (excludeId) {
    query._id = { $ne: excludeId }
  }
  return Boolean(await Content.exists(query))
}

async function ensureUniqueSlug({ tenantId, slug, excludeId }) {
  const exists = await slugExists({ tenantId, slug, excludeId })
  if (exists) {
    throw new Error('Slug already exists for this tenant')
  }
}

async function generateUniqueSlug({ tenantId, baseSlug, excludeId }) {
  let candidate = baseSlug
  let counter = 1
  while (await slugExists({ tenantId, slug: candidate, excludeId })) {
    candidate = `${baseSlug}-${counter}`
    counter += 1
  }
  return candidate
}

function normaliseObjectIdList(values = []) {
  if (!Array.isArray(values)) return []
  return values
    .map((value) => {
      if (!value) return null
      const id = value instanceof ObjectId ? value : ObjectId.isValid(value) ? new ObjectId(value) : null
      return id
    })
    .filter(Boolean)
}

function normaliseTagIds(values = []) {
  return normaliseObjectIdList(values)
}

function resolveStatusAndDates({ status, publishAt }) {
  const payload = {}
  if (status === 'published') {
    payload.status = 'published'
    payload.publishAt = publishAt ? new Date(publishAt) : new Date()
    payload.publishedAt = payload.publishAt
  } else if (status === 'scheduled') {
    if (!publishAt) {
      throw new Error('publishAt is required for scheduled content')
    }
    payload.status = 'scheduled'
    payload.publishAt = new Date(publishAt)
    payload.publishedAt = null
  } else if (status === 'archived') {
    payload.status = 'archived'
    payload.publishAt = null
    payload.publishedAt = null
  } else {
    payload.status = 'draft'
    payload.publishAt = null
    payload.publishedAt = null
  }
  return payload
}

async function createContent({ tenantId, userId, payload }) {
  const {
    title,
    slug,
    summary = '',
    lexical,
    html,
    categories = [],
    tags = [],
    featuredMediaId = null,
    status = 'draft',
    publishAt,
    authorName = '',
  } = payload

  if (!title) {
    throw new Error('Title is required')
  }

  const finalSlug = slugify(slug || title)
  if (!finalSlug) {
    throw new Error('Slug is required')
  }

  await ensureUniqueSlug({ tenantId, slug: finalSlug })

  const statusPayload = resolveStatusAndDates({ status, publishAt })

  const document = await Content.create({
    tenantId,
    title,
    slug: finalSlug,
    summary,
    lexical,
    html,
    categories: normaliseObjectIdList(categories),
    tags: normaliseTagIds(tags),
    featuredMediaId: featuredMediaId && ObjectId.isValid(featuredMediaId) ? new ObjectId(featuredMediaId) : null,
    authorName,
    ...statusPayload,
    createdBy: userId ? new ObjectId(userId) : null,
    updatedBy: userId ? new ObjectId(userId) : null,
    version: 1,
  })

  const version = await ContentVersion.create({
    tenantId,
    contentId: document._id,
    version: 1,
    title,
    slug: finalSlug,
    summary,
    lexical,
    html,
    categories: normaliseObjectIdList(categories),
    tags: normaliseTagIds(tags),
    featuredMediaId: document.featuredMediaId || null,
    authorName,
    publishAt: statusPayload.publishAt,
    publishedAt: statusPayload.publishedAt,
    status: statusPayload.status,
    createdBy: userId ? new ObjectId(userId) : null,
    publishedBy: statusPayload.status === 'published' && userId ? new ObjectId(userId) : null,
  })

  document.lastVersionId = version._id
  await document.save()

  return document.toObject()
}

async function updateContent({ tenantId, contentId, userId, payload }) {
  if (!ObjectId.isValid(contentId)) {
    throw new Error('Invalid content id')
  }

  const existing = await Content.findOne({ _id: contentId, tenantId })
  if (!existing) {
    throw new Error('Content not found')
  }

  const update = {}
  let title = existing.title
  let slug = existing.slug
  let summary = existing.summary || ''
  let lexical = existing.lexical
  let html = existing.html
  let categories = existing.categories || []
  let tags = existing.tags || []
  let featuredMediaId = existing.featuredMediaId || null
  let authorName = existing.authorName || ''

  if (payload.title !== undefined) {
    if (!payload.title) {
      throw new Error('Title cannot be empty')
    }
    title = payload.title
    update.title = title
  }

  if (payload.slug !== undefined) {
    const nextSlug = slugify(payload.slug || title)
    if (!nextSlug) {
      throw new Error('Slug is required')
    }
    await ensureUniqueSlug({ tenantId, slug: nextSlug, excludeId: existing._id })
    slug = nextSlug
    update.slug = slug
  }

  if (payload.summary !== undefined) {
    summary = payload.summary || ''
    update.summary = summary
  }

  if (payload.lexical !== undefined) {
    lexical = payload.lexical
    update.lexical = lexical
  }

  if (payload.html !== undefined) {
    html = payload.html
    update.html = html
  }

  if (payload.categories !== undefined) {
    categories = normaliseObjectIdList(payload.categories)
    update.categories = categories
  }

  if (payload.tags !== undefined) {
    tags = normaliseTagIds(payload.tags)
    update.tags = tags
  }

  if (payload.featuredMediaId !== undefined) {
    featuredMediaId = payload.featuredMediaId && ObjectId.isValid(payload.featuredMediaId)
      ? new ObjectId(payload.featuredMediaId)
      : null
    update.featuredMediaId = featuredMediaId
  }

  if (payload.authorName !== undefined) {
    authorName = payload.authorName || ''
    update.authorName = authorName
  }

  const statusPayload = resolveStatusAndDates({
    status: payload.status !== undefined ? payload.status : existing.status,
    publishAt: payload.publishAt !== undefined ? payload.publishAt : existing.publishAt,
  })

  Object.assign(update, statusPayload)

  if (statusPayload.status === 'published' && userId) {
    update.publishedBy = new ObjectId(userId)
  } else if (statusPayload.status !== 'published') {
    update.publishedBy = null
  }

  if (userId) {
    update.updatedBy = new ObjectId(userId)
  }

  const nextVersion = existing.version + 1
  update.version = nextVersion

  const updated = await Content.findOneAndUpdate(
    { _id: existing._id, tenantId },
    { $set: update },
    { new: true }
  )

  if (!updated) {
    throw new Error('Content update failed')
  }

  const version = await ContentVersion.create({
    tenantId,
    contentId: existing._id,
    version: nextVersion,
    title,
    slug,
    summary,
    lexical,
    html,
    categories,
    tags,
    featuredMediaId,
    authorName,
    publishAt: statusPayload.publishAt,
    publishedAt: statusPayload.publishedAt,
    status: statusPayload.status,
    createdBy: userId ? new ObjectId(userId) : null,
    publishedBy: statusPayload.status === 'published' && userId ? new ObjectId(userId) : null,
  })

  updated.lastVersionId = version._id
  await updated.save()

  return updated.toObject()
}

async function deleteContent({ tenantId, contentId }) {
  if (!ObjectId.isValid(contentId)) {
    throw new Error('Invalid content id')
  }

  const result = await Content.deleteOne({ _id: contentId, tenantId })
  if (!result.deletedCount) {
    return { deleted: 0 }
  }

  await ContentVersion.deleteMany({ tenantId, contentId })
  return { deleted: result.deletedCount }
}

async function getContent({ tenantId, contentId }) {
  if (!ObjectId.isValid(contentId)) {
    throw new Error('Invalid content id')
  }

  const content = await Content.findOne({ _id: contentId, tenantId })
    .populate('featuredMediaId')
    .lean()

  if (!content) {
    throw new Error('Content not found')
  }

  return content
}

async function listContents({ tenantId, filters = {}, pagination = {} }) {
  const {
    status,
    search,
    category,
    tag,
  } = filters

  const page = Math.max(Number(pagination.page || 1), 1)
  const limit = Math.min(Math.max(Number(pagination.limit || 20), 1), 100)
  const skip = (page - 1) * limit

  const query = { tenantId }
  if (status) {
    query.status = status
  }
  if (category && ObjectId.isValid(category)) {
    query.categories = new ObjectId(category)
  }
  if (tag && ObjectId.isValid(tag)) {
    query.tags = new ObjectId(tag)
  }
  if (search) {
    const normalised = search.trim().split(/\s+/).join(' ')
    query.$or = [
      { title: new RegExp(normalised, 'i') },
      { summary: new RegExp(normalised, 'i') }
    ]
  }

  const [items, total] = await Promise.all([
    Content.find(query)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Content.countDocuments(query)
  ])

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    }
  }
}

async function listVersions({ tenantId, contentId }) {
  if (!ObjectId.isValid(contentId)) {
    throw new Error('Invalid content id')
  }

  const versions = await ContentVersion.find({ tenantId, contentId })
    .sort({ version: -1 })
    .lean()

  return versions
}

async function checkSlugAvailability({ tenantId, slug, excludeId }) {
  if (!slug) {
    throw new Error('Slug is required')
  }

  const baseSlug = slugify(slug)
  if (!baseSlug) {
    throw new Error('Slug is invalid')
  }

  const exists = await slugExists({ tenantId, slug: baseSlug, excludeId })
  if (!exists) {
    return { available: true, slug: baseSlug }
  }

  const suggestion = await generateUniqueSlug({ tenantId, baseSlug, excludeId })
  return { available: false, suggestion }
}

module.exports = {
  createContent,
  updateContent,
  deleteContent,
  getContent,
  listContents,
  listVersions,
  checkSlugAvailability,
}
