const { Content, ContentVersion } = require('@contexthub/common')
const mongoose = require('mongoose')
const galleryService = require('./galleryService')

const ObjectId = mongoose.Types.ObjectId

const CONTENT_SCHEDULING_DISABLED_CODE = 'CONTENT_SCHEDULING_DISABLED'

const TURKISH_CHAR_MAP = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', Â: 'a'
}

function transliterate(value = '') {
  return value
    .split('')
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join('')
}

function slugify(value) {
  return transliterate(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
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

function createSchedulingDisabledError() {
  const error = new Error('Content scheduling is disabled for this tenant')
  error.code = CONTENT_SCHEDULING_DISABLED_CODE
  return error
}

function resolveStatusAndDates({ status, publishAt }, { allowScheduling = false } = {}) {
  const payload = {}
  if (status === 'published') {
    payload.status = 'published'
    payload.publishAt = publishAt ? new Date(publishAt) : new Date()
    payload.publishedAt = payload.publishAt
  } else if (status === 'scheduled') {
    if (!allowScheduling) {
      throw createSchedulingDisabledError()
    }
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

async function createContent({ tenantId, userId, payload, featureFlags = {} }) {
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

  const allowScheduling = Boolean(featureFlags?.contentScheduling)
  const statusPayload = resolveStatusAndDates({ status, publishAt }, { allowScheduling })

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

async function updateContent({ tenantId, contentId, userId, payload, featureFlags = {} }) {
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

  const requestedStatus = payload.status !== undefined ? payload.status : existing.status
  const requestedPublishAt = payload.publishAt !== undefined ? payload.publishAt : existing.publishAt
  const allowScheduling = Boolean(featureFlags?.contentScheduling) || existing.status === 'scheduled'

  const statusPayload = resolveStatusAndDates(
    {
      status: requestedStatus,
      publishAt: requestedPublishAt,
    },
    { allowScheduling }
  )

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
  await galleryService.setGalleriesForContent({ tenantId, contentId, galleryIds: [] })
  return { deleted: result.deletedCount }
}

async function deleteVersions({ tenantId, contentId, versionIds = [], user }) {
  if (!ObjectId.isValid(contentId)) {
    throw new Error('Invalid content id')
  }

  if (!Array.isArray(versionIds) || !versionIds.length) {
    throw new Error('At least one version id is required')
  }

  const targetIds = versionIds
    .map((value) => {
      if (!value) return null
      if (value instanceof ObjectId) return value
      return ObjectId.isValid(value) ? new ObjectId(value) : null
    })
    .filter(Boolean)

  if (!targetIds.length) {
    throw new Error('No valid version ids provided')
  }

  const candidateVersions = await ContentVersion.find({
    _id: { $in: targetIds },
    tenantId,
    contentId,
    deletedAt: null,
  })
    .select({ _id: 1, version: 1 })
    .lean()

  if (!candidateVersions.length) {
    return { deleted: 0, deletedVersions: [] }
  }

  // Check if we're trying to delete the last active version
  const totalActiveVersions = await ContentVersion.countDocuments({
    tenantId,
    contentId,
    deletedAt: null,
  })

  const candidateIds = candidateVersions.map((item) => item._id.toString())
  const remainingActiveVersions = totalActiveVersions - candidateVersions.length

  if (remainingActiveVersions < 1) {
    throw new Error('Cannot delete all versions. At least one version must remain active. Use content delete endpoint to remove the entire content.')
  }

  const now = new Date()
  const deletePayload = { deletedAt: now }
  const userId = user?._id ? new ObjectId(user._id) : null
  if (userId) {
    deletePayload.deletedBy = userId
  }

  const derivedName = (() => {
    if (!user) return null
    if (user.name) return user.name
    const parts = [user.firstName, user.lastName].filter(Boolean)
    if (parts.length) {
      return parts.join(' ').trim()
    }
    return user.email || null
  })()

  if (derivedName) {
    deletePayload.deletedByName = derivedName
  }

  const idsToUpdate = candidateVersions.map((item) => item._id)

  await ContentVersion.updateMany(
    { _id: { $in: idsToUpdate } },
    { $set: deletePayload }
  )

  const deletedIdStrings = new Set(idsToUpdate.map((id) => id.toString()))

  const content = await Content.findOne({ _id: contentId, tenantId })
    .select({ lastVersionId: 1 })
    .lean()

  let updatedLastVersionId = null

  if (content && content.lastVersionId && deletedIdStrings.has(String(content.lastVersionId))) {
    const latestActive = await ContentVersion.findOne({
      tenantId,
      contentId,
      deletedAt: null,
    })
      .sort({ version: -1 })
      .select({ _id: 1 })
      .lean()

    await Content.updateOne(
      { _id: contentId, tenantId },
      { $set: { lastVersionId: latestActive ? latestActive._id : null } }
    )

    updatedLastVersionId = latestActive ? latestActive._id.toString() : null
  }

  return {
    deleted: candidateVersions.length,
    deletedVersions: candidateVersions.map((item) => ({
      versionId: item._id.toString(),
      version: item.version,
    })),
    lastVersionId: updatedLastVersionId,
  }
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

  const galleries = await galleryService.listByContent({ tenantId, contentId })

  return {
    ...content,
    galleries
  }
}

async function getContentBySlug({ tenantId, slug }) {
  if (!slug) {
    throw new Error('Slug is required')
  }

  const content = await Content.findOne({ tenantId, slug })
    .populate('featuredMediaId')
    .lean()

  if (!content) {
    throw new Error('Content not found')
  }

  const galleries = await galleryService.listByContent({ tenantId, contentId: content._id })

  return {
    ...content,
    galleries
  }
}

async function listContents({ tenantId, filters = {}, pagination = {} }) {
  const {
    status,
    search,
    category,
    categories,
    tag,
  } = filters

  const page = Math.max(Number(pagination.page || 1), 1)
  const limit = Math.min(Math.max(Number(pagination.limit || 20), 1), 100)
  const skip = (page - 1) * limit

  const query = { tenantId }
  if (status) {
    query.status = status
  }

  // Handle both single category and multiple categories
  const categoryFilter = categories || category
  if (categoryFilter) {
    // Support comma-separated category IDs
    const categoryIds = typeof categoryFilter === 'string'
      ? categoryFilter.split(',').map(id => id.trim()).filter(Boolean)
      : Array.isArray(categoryFilter)
        ? categoryFilter
        : [categoryFilter]

    const validCategoryIds = categoryIds
      .filter(id => ObjectId.isValid(id))
      .map(id => new ObjectId(id))

    if (validCategoryIds.length > 0) {
      // Find contents that have ANY of the specified categories
      query.categories = { $in: validCategoryIds }
    }
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

  const [versions, deletedVersionsRaw] = await Promise.all([
    ContentVersion.find({ tenantId, contentId, deletedAt: null })
      .sort({ version: -1 })
      .lean(),
    ContentVersion.find({ tenantId, contentId, deletedAt: { $ne: null } })
      .sort({ deletedAt: -1 })
      .populate('deletedBy', 'name firstName lastName email')
      .lean(),
  ])

  const deletedVersions = deletedVersionsRaw.map((item) => {
    const deletedByDisplayName = item.deletedByName
      || (item.deletedBy
        ? item.deletedBy.name
          || [item.deletedBy.firstName, item.deletedBy.lastName].filter(Boolean).join(' ').trim()
          || item.deletedBy.email
        : null)

    return {
      ...item,
      deletedBy: item.deletedBy
        ? {
            _id: item.deletedBy._id.toString(),
            name: item.deletedBy.name || null,
            firstName: item.deletedBy.firstName || null,
            lastName: item.deletedBy.lastName || null,
            email: item.deletedBy.email || null,
          }
        : null,
      deletedByDisplayName: deletedByDisplayName || null,
    }
  })

  const deletionLog = deletedVersions.map((item) => ({
    versionId: item._id.toString(),
    version: item.version,
    deletedAt: item.deletedAt,
    deletedBy: {
      id: item.deletedBy?._id || null,
      name: item.deletedByDisplayName,
      email: item.deletedBy?.email || null,
    },
  }))

  return {
    versions,
    deletedVersions,
    deletionLog,
  }
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

  // Find the existing content with this slug
  const existingContent = await Content.findOne({ tenantId, slug: baseSlug, deletedAt: null })
    .select({ _id: 1, title: 1, slug: 1 })
    .lean()

  const suggestion = await generateUniqueSlug({ tenantId, baseSlug, excludeId })
  return {
    available: false,
    suggestion,
    existingContent: existingContent ? {
      id: existingContent._id.toString(),
      title: existingContent.title,
      slug: existingContent.slug
    } : null
  }
}

async function setContentGalleries({ tenantId, contentId, galleryIds }) {
  const galleries = await galleryService.setGalleriesForContent({ tenantId, contentId, galleryIds })
  return galleries
}

module.exports = {
  createContent,
  updateContent,
  deleteContent,
  deleteVersions,
  getContent,
  getContentBySlug,
  listContents,
  listVersions,
  checkSlugAvailability,
  CONTENT_SCHEDULING_DISABLED_CODE,
  setContentGalleries,
}
