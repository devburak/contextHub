const {
  Content,
  ContentVersion,
  Category,
  Tag,
  CustomFieldDefinition,
  ContentCustomFieldIndex
} = require('@contexthub/common')
const mongoose = require('mongoose')
const galleryService = require('./galleryService')
const { emitDomainEvent } = require('../lib/domainEvents')
const { triggerWebhooksForTenant } = require('../lib/webhookTrigger')
const { sanitizeHtmlContent } = require('../utils/htmlSanitizer')

const ObjectId = mongoose.Types.ObjectId

const CONTENT_SCHEDULING_DISABLED_CODE = 'CONTENT_SCHEDULING_DISABLED'
const RESERVED_CUSTOM_FIELD_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function normalizeCustomFieldKey(value = '') {
  const key = String(value)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
  return RESERVED_CUSTOM_FIELD_KEYS.has(key) ? '' : key
}

function normalizeTextValue(value) {
  return String(value ?? '').trim()
}

function normalizeBooleanValue(value) {
  if (typeof value === 'boolean') return value
  const text = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'evet', 'on'].includes(text)) return true
  if (['false', '0', 'no', 'hayir', 'hayır', 'off'].includes(text)) return false
  return Boolean(value)
}

function normalizeDateValue(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function normalizeCustomFieldValue(definition, value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  switch (definition?.type) {
    case 'number': {
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : undefined
    }
    case 'boolean':
      return normalizeBooleanValue(value)
    case 'date':
      return normalizeDateValue(value)
    case 'multi-select':
    case 'multi-reference':
      return Array.isArray(value)
        ? value.map(normalizeTextValue).filter(Boolean)
        : String(value).split(',').map(normalizeTextValue).filter(Boolean)
    case 'json':
      return value
    case 'select':
    case 'url':
    case 'reference':
    case 'text':
    default:
      return normalizeTextValue(value)
  }
}

async function getCustomFieldDefinitions(tenantId) {
  return CustomFieldDefinition.find({ tenantId }).sort({ position: 1, label: 1, key: 1 }).lean()
}

async function normalizeCustomFieldsForTenant({ tenantId, customFields = {} }) {
  if (customFields === undefined || customFields === null) {
    customFields = {}
  }

  if (!isPlainObject(customFields)) {
    throw new Error('customFields must be a JSON object')
  }

  const definitions = await getCustomFieldDefinitions(tenantId)
  const definitionMap = new Map(definitions.map((definition) => [definition.key, definition]))
  const normalized = {}

  Object.entries(customFields).forEach(([rawKey, value]) => {
    const key = normalizeCustomFieldKey(rawKey)
    if (!key) return

    const definition = definitionMap.get(key)
    const normalizedValue = normalizeCustomFieldValue(definition || { type: 'json' }, value)
    if (normalizedValue !== undefined) {
      normalized[key] = normalizedValue
    }
  })

  definitions.forEach((definition) => {
    if (!definition.required) return
    const value = normalized[definition.key]
    const isMissing = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
    if (isMissing) {
      throw new Error(`Custom field "${definition.label || definition.key}" is required`)
    }
  })

  return Object.keys(normalized).length ? normalized : undefined
}

async function getPublicCustomFieldKeySet(tenantId) {
  const definitions = await CustomFieldDefinition.find({ tenantId, public: true })
    .select({ key: 1 })
    .lean()
  return new Set(definitions.map((definition) => definition.key))
}

function filterCustomFieldsByKeySet(content, publicKeys) {
  if (!content || !isPlainObject(content.customFields)) {
    return content
  }

  const customFields = Object.fromEntries(
    Object.entries(content.customFields).filter(([key]) => publicKeys.has(key))
  )

  return {
    ...content,
    customFields: Object.keys(customFields).length ? customFields : undefined
  }
}

async function filterPublicCustomFields({ tenantId, content }) {
  const publicKeys = await getPublicCustomFieldKeySet(tenantId)
  return filterCustomFieldsByKeySet(content, publicKeys)
}

async function filterPublicCustomFieldsInList({ tenantId, result }) {
  const publicKeys = await getPublicCustomFieldKeySet(tenantId)
  return {
    ...result,
    items: (result.items || []).map((item) => filterCustomFieldsByKeySet(item, publicKeys))
  }
}

function buildIndexValue(definition, value) {
  if (value === undefined || value === null || value === '') {
    return null
  }

  const payload = {
    key: definition.key,
    valueTokens: []
  }

  switch (definition.type) {
    case 'number': {
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) return null
      payload.valueNumber = parsed
      payload.valueString = String(parsed)
      payload.valueTokens = [String(parsed)]
      return payload
    }
    case 'boolean':
      payload.valueBoolean = normalizeBooleanValue(value)
      payload.valueString = String(payload.valueBoolean)
      payload.valueTokens = [payload.valueString]
      return payload
    case 'date': {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return null
      payload.valueDate = date
      payload.valueString = date.toISOString()
      payload.valueTokens = [date.toISOString().slice(0, 10)]
      return payload
    }
    case 'multi-select':
    case 'multi-reference': {
      const values = Array.isArray(value) ? value.map(normalizeTextValue).filter(Boolean) : []
      if (!values.length) return null
      payload.valueString = values.join(',')
      payload.valueTokens = values
      return payload
    }
    case 'json':
      payload.valueString = JSON.stringify(value)
      payload.valueTokens = []
      return payload
    case 'select':
    case 'url':
    case 'reference':
    case 'text':
    default:
      payload.valueString = normalizeTextValue(value)
      payload.valueTokens = payload.valueString ? [payload.valueString] : []
      return payload.valueString ? payload : null
  }
}

async function syncCustomFieldIndex({ tenantId, content }) {
  if (!content?._id) return

  await ContentCustomFieldIndex.deleteMany({ tenantId, contentId: content._id })

  const customFields = content.customFields || {}
  if (!isPlainObject(customFields)) {
    return
  }

  const definitions = await CustomFieldDefinition.find({
    tenantId,
    $or: [{ filterable: true }, { searchable: true }]
  }).lean()

  const rows = definitions
    .map((definition) => {
      const indexed = buildIndexValue(definition, customFields[definition.key])
      if (!indexed) return null

      return {
        tenantId,
        contentId: content._id,
        status: content.status,
        publishedAt: content.publishedAt,
        updatedAt: new Date(),
        ...indexed
      }
    })
    .filter(Boolean)

  if (rows.length) {
    await ContentCustomFieldIndex.insertMany(rows)
  }
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
    customFields,
    featuredMediaId = null,
    status = 'draft',
    publishAt,
    authorName = '',
    path = null,
    locale = null,
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
  const normalizedCustomFields = await normalizeCustomFieldsForTenant({ tenantId, customFields })
  const sanitizedHtml = sanitizeHtmlContent(html)

  const document = await Content.create({
    tenantId,
    title,
    slug: finalSlug,
    summary,
    lexical,
    html: sanitizedHtml,
    categories: normaliseObjectIdList(categories),
    tags: normaliseTagIds(tags),
    customFields: normalizedCustomFields,
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
    html: sanitizedHtml,
    categories: normaliseObjectIdList(categories),
    tags: normaliseTagIds(tags),
    customFields: normalizedCustomFields,
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
  await syncCustomFieldIndex({ tenantId, content: document })

  try {
    const eventPayload = {
      contentId: document._id ? document._id.toString() : null,
      slug: document.slug,
      path,
      locale,
      status: document.status,
      version: document.version,
      updatedAt: document.updatedAt ? document.updatedAt.toISOString() : new Date().toISOString()
    }

    const metadata = {
      triggeredBy: userId ? 'user' : 'system',
      source: 'admin-ui'
    }

    if (userId) {
      metadata.userId = userId.toString()
    }

    const eventId = await emitDomainEvent(tenantId, 'content.created', eventPayload, metadata)
    if (eventId) {
      triggerWebhooksForTenant(tenantId)
    }
  } catch (error) {
    console.error('[domainEvents] Failed to emit event', error)
  }

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
  let customFields = existing.customFields
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
    html = sanitizeHtmlContent(payload.html)
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

  if (payload.customFields !== undefined) {
    customFields = await normalizeCustomFieldsForTenant({ tenantId, customFields: payload.customFields })
    update.customFields = customFields
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
    customFields,
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
  await syncCustomFieldIndex({ tenantId, content: updated })

  try {
    const eventPayload = {
      contentId: updated._id ? updated._id.toString() : null,
      slug: updated.slug,
      path: payload?.path ?? null,
      locale: payload?.locale ?? null,
      status: updated.status,
      version: updated.version,
      updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : new Date().toISOString()
    }

    const metadata = {
      triggeredBy: userId ? 'user' : 'system',
      source: 'admin-ui'
    }

    if (userId) {
      metadata.userId = userId.toString()
    }

    // Emit the most specific lifecycle event for status transitions so that
    // content.published / content.unpublished subscribers are actually notified.
    const wasPublished = existing.status === 'published'
    const isPublished = updated.status === 'published'
    let eventType = 'content.updated'
    if (!wasPublished && isPublished) {
      eventType = 'content.published'
    } else if (wasPublished && !isPublished) {
      eventType = 'content.unpublished'
    }

    const eventId = await emitDomainEvent(tenantId, eventType, eventPayload, metadata)
    if (eventId) {
      triggerWebhooksForTenant(tenantId)
    }
  } catch (error) {
    console.error('[domainEvents] Failed to emit event', error)
  }

  return updated.toObject()
}

async function deleteContent({ tenantId, contentId, userId }) {
  if (!ObjectId.isValid(contentId)) {
    throw new Error('Invalid content id')
  }

  const existing = await Content.findOne({ _id: contentId, tenantId })
  if (!existing) {
    return { deleted: 0 }
  }

  const result = await Content.deleteOne({ _id: contentId, tenantId })

  await ContentVersion.deleteMany({ tenantId, contentId })
  await ContentCustomFieldIndex.deleteMany({ tenantId, contentId })
  await galleryService.setGalleriesForContent({ tenantId, contentId, galleryIds: [] })

  try {
    const payload = {
      contentId: existing._id ? existing._id.toString() : contentId,
      slug: existing.slug,
      status: existing.status,
      version: existing.version,
      deletedAt: new Date().toISOString()
    }

    const metadata = {
      triggeredBy: userId ? 'user' : 'system',
      source: 'admin-ui'
    }

    if (userId) {
      metadata.userId = userId.toString()
    }

    const eventId = await emitDomainEvent(tenantId, 'content.deleted', payload, metadata)
    if (eventId) {
      triggerWebhooksForTenant(tenantId)
    }
  } catch (error) {
    console.error('[domainEvents] Failed to emit event', error)
  }

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

function buildStatusFilter(status) {
  if (!status) {
    return null
  }

  const values = Array.isArray(status)
    ? status.map((value) => (typeof value === 'string' ? value.trim() : String(value).trim()))
    : String(status).split(',').map((value) => value.trim())

  const filtered = values.filter(Boolean)
  if (!filtered.length) {
    return null
  }

  if (filtered.length === 1) {
    return filtered[0]
  }

  return { $in: filtered }
}

function buildDateRangeFilter(from, to) {
  const range = {}

  if (from) {
    const fromDate = new Date(from)
    if (!Number.isNaN(fromDate.getTime())) {
      range.$gte = fromDate
    }
  }

  if (to) {
    const toDate = new Date(to)
    if (!Number.isNaN(toDate.getTime())) {
      range.$lte = toDate
    }
  }

  return Object.keys(range).length ? range : null
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeCustomFilterValue(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeCustomFilterValue(item))
  }

  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

async function resolveCustomSearchContentIds({ tenantId, search }) {
  const normalised = String(search || '').trim().split(/\s+/).join(' ')
  if (!normalised) {
    return []
  }

  const definitions = await CustomFieldDefinition.find({
    tenantId,
    searchable: true
  }).select({ key: 1 }).lean()

  const keys = definitions.map((definition) => definition.key)
  if (!keys.length) {
    return []
  }

  const valuePattern = new RegExp(escapeRegExp(normalised), 'i')
  const rows = await ContentCustomFieldIndex.find({
    tenantId,
    key: { $in: keys },
    $or: [
      { valueString: valuePattern },
      { valueTokens: normalised }
    ]
  }).select('contentId').lean()

  return Array.from(new Set(rows.map((row) => row.contentId.toString())))
    .filter(ObjectId.isValid)
    .map((id) => new ObjectId(id))
}

function buildCustomIndexCriteria(definition, rawValue) {
  const values = normalizeCustomFilterValue(rawValue)
  if (!values.length) return null

  switch (definition?.type) {
    case 'number': {
      const numbers = values.map(Number).filter(Number.isFinite)
      return numbers.length ? { valueNumber: { $in: numbers } } : null
    }
    case 'boolean': {
      const booleans = Array.from(new Set(values.map(normalizeBooleanValue)))
      return { valueBoolean: { $in: booleans } }
    }
    case 'date': {
      const dates = values
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
      return dates.length ? { valueDate: { $in: dates } } : null
    }
    case 'multi-select':
    case 'multi-reference':
      return { valueTokens: { $in: values } }
    case 'select':
    case 'url':
    case 'reference':
    case 'text':
    default:
      return { valueString: { $in: values } }
  }
}

async function resolveCustomFieldContentIds({ tenantId, customFilters = {} }) {
  const entries = Object.entries(customFilters || {})
    .map(([key, value]) => [normalizeCustomFieldKey(key), value])
    .filter(([key, value]) => key && value !== undefined && value !== null && value !== '')

  if (!entries.length) {
    return null
  }

  const keys = entries.map(([key]) => key)
  const definitions = await CustomFieldDefinition.find({
    tenantId,
    key: { $in: keys },
    filterable: true
  }).lean()
  const definitionMap = new Map(definitions.map((definition) => [definition.key, definition]))

  let intersection = null

  for (const [key, rawValue] of entries) {
    const definition = definitionMap.get(key)
    if (!definition) {
      return []
    }

    const valueCriteria = buildCustomIndexCriteria(definition, rawValue)
    if (!valueCriteria) {
      return []
    }

    const rows = await ContentCustomFieldIndex.find({
      tenantId,
      key,
      ...valueCriteria
    }).select('contentId').lean()

    const ids = new Set(rows.map((row) => row.contentId.toString()))
    if (intersection === null) {
      intersection = ids
    } else {
      intersection = new Set([...intersection].filter((id) => ids.has(id)))
    }

    if (!intersection.size) {
      return []
    }
  }

  return Array.from(intersection || [])
    .filter(ObjectId.isValid)
    .map((id) => new ObjectId(id))
}

async function getContentBySlug({ tenantId, slug, status = null, publishedFrom = null, publishedTo = null }) {
  if (!slug) {
    throw new Error('Slug is required')
  }

  const query = { tenantId, slug }
  const statusClause = buildStatusFilter(status)
  if (statusClause) {
    query.status = statusClause
  }

  const publishedRange = buildDateRangeFilter(publishedFrom, publishedTo)
  if (publishedRange) {
    query.publishedAt = publishedRange
  }

  let content = await Content.findOne(query)
    .sort({ publishedAt: -1, createdAt: -1, _id: -1 })
    .populate('featuredMediaId')
    .lean()

  if (!content && publishedRange) {
    const scheduleQuery = { ...query }
    delete scheduleQuery.publishedAt
    scheduleQuery.publishAt = publishedRange

    content = await Content.findOne(scheduleQuery)
      .sort({ publishAt: -1, createdAt: -1, _id: -1 })
      .populate('featuredMediaId')
      .lean()
  }

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
    categoryName,
    tag,
    tagName,
    publishedFrom,
    publishedTo,
    customFilters = {},
  } = filters

  const page = Math.max(Number(pagination.page || 1), 1)
  const limit = Math.min(Math.max(Number(pagination.limit || 20), 1), 100)
  const skip = (page - 1) * limit

  const query = { tenantId }
  const statusClause = buildStatusFilter(status)
  if (statusClause) {
    query.status = statusClause
  }

  // Handle category filtering by ID or name
  const categoryFilter = categories || category
  if (categoryFilter || categoryName) {
    let categoryIds = []

    // If category IDs are provided
    if (categoryFilter) {
      const ids = typeof categoryFilter === 'string'
        ? categoryFilter.split(',').map(id => id.trim()).filter(Boolean)
        : Array.isArray(categoryFilter)
          ? categoryFilter
          : [categoryFilter]

      categoryIds = ids
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id))
    }

    // If category name is provided, search by name
    if (categoryName) {
      const normalizedName = categoryName.trim()
      const matchingCategories = await Category.find({
        tenantId,
        name: new RegExp(normalizedName, 'i')
      }).select('_id').lean()

      const nameCategoryIds = matchingCategories.map(cat => cat._id)
      categoryIds = [...categoryIds, ...nameCategoryIds]
    }

    if (categoryIds.length > 0) {
      // Find contents that have ANY of the specified categories
      query.categories = { $in: categoryIds }
    }
  }

  // Handle tag filtering by ID or name
  if (tag || tagName) {
    let tagIds = []

    // If tag IDs are provided
    if (tag) {
      const ids = typeof tag === 'string'
        ? tag.split(',').map(id => id.trim()).filter(Boolean)
        : Array.isArray(tag)
          ? tag
          : [tag]

      tagIds = ids
        .filter(id => ObjectId.isValid(id))
        .map(id => new ObjectId(id))
    }

    // If tag name is provided, search by title
    if (tagName) {
      const normalizedName = tagName.trim()
      // Tag.title can be a string or an object with language keys
      const matchingTags = await Tag.find({
        tenantId,
        $or: [
          { 'title': new RegExp(normalizedName, 'i') }, // If title is a string
          { 'title.en': new RegExp(normalizedName, 'i') }, // If title is an object
          { 'title.tr': new RegExp(normalizedName, 'i') },
          { slug: new RegExp(normalizedName, 'i') }
        ]
      }).select('_id').lean()

      const nameTagIds = matchingTags.map(tag => tag._id)
      tagIds = [...tagIds, ...nameTagIds]
    }

    if (tagIds.length > 0) {
      query.tags = { $in: tagIds }
    }
  }

  // Handle text search in title, summary and exact slug match
  if (search) {
    const normalised = search.trim().split(/\s+/).join(' ')
    const customSearchContentIds = await resolveCustomSearchContentIds({ tenantId, search: normalised })
    const searchPattern = new RegExp(escapeRegExp(normalised), 'i')
    const exactSlug = normalised.toLowerCase()
    query.$or = [
      { title: searchPattern },
      { summary: searchPattern },
      { slug: exactSlug },
      ...(customSearchContentIds.length ? [{ _id: { $in: customSearchContentIds } }] : [])
    ]
  }

  if (publishedFrom || publishedTo) {
    const publishedAtFilter = {}
    if (publishedFrom) {
      const fromDate = new Date(publishedFrom)
      if (!Number.isNaN(fromDate.getTime())) {
        publishedAtFilter.$gte = fromDate
      }
    }
    if (publishedTo) {
      const toDate = new Date(publishedTo)
      if (!Number.isNaN(toDate.getTime())) {
        publishedAtFilter.$lte = toDate
      }
    }

    if (Object.keys(publishedAtFilter).length > 0) {
      query.publishedAt = { ...(query.publishedAt || {}), ...publishedAtFilter }
    }
  }

  const customContentIds = await resolveCustomFieldContentIds({ tenantId, customFilters })
  if (Array.isArray(customContentIds)) {
    query._id = { $in: customContentIds }
  }

  const [items, total] = await Promise.all([
    Content.find(query)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('categories', 'name slug')
      .populate('tags', 'slug title')
      .populate('featuredMediaId', 'url title altText variants')
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

async function getArchiveStatistics({ tenantId, status = 'published' } = {}) {
  if (!tenantId) {
    throw new Error('tenantId is required')
  }

  try {
    // Build the query - same as listContents
    const query = { tenantId }
    const statusClause = buildStatusFilter(status)
    if (statusClause) {
      query.status = statusClause
    }



    // Fetch all matching contents with publishedAt
    const contents = await Content.find(query)
      .select('publishedAt')
      .lean()
      .exec()



    if (contents.length === 0) {
      return { total: 0, archives: [] }
    }

    // Group by year and month using JavaScript
    const archiveMap = new Map()

    contents.forEach(doc => {
      if (!doc.publishedAt) return

      const date = new Date(doc.publishedAt)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0') // getMonth is 0-indexed

      const key = `${year}-${month}`
      if (!archiveMap.has(key)) {
        archiveMap.set(key, { year, month, count: 0 })
      }

      const item = archiveMap.get(key)
      item.count += 1
    })

    // Convert map to array and sort
    const archives = Array.from(archiveMap.values())
      .sort((a, b) => {
        const yearDiff = b.year - a.year
        if (yearDiff !== 0) return yearDiff
        return parseInt(b.month) - parseInt(a.month)
      })

    const result = {
      total: contents.length,
      archives
    }

    return result
  } catch (error) {
    console.error('[Archive] Error:', error)
    throw error
  }
}

async function publishDueScheduledContent(options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : 50
  const now = new Date()
  const filter = {
    status: 'scheduled',
    publishAt: { $lte: now }
  }

  if (options.tenantId) {
    if (options.tenantId instanceof ObjectId) {
      filter.tenantId = options.tenantId
    } else if (ObjectId.isValid(options.tenantId)) {
      filter.tenantId = new ObjectId(options.tenantId)
    } else {
      throw new Error('Invalid tenantId provided to publishDueScheduledContent')
    }
  }

  const dueContents = await Content.find(filter)
    .sort({ publishAt: 1 })
    .limit(limit)
    .lean()

  if (!dueContents.length) {
    return { matched: 0, published: 0, eventsEmitted: 0 }
  }

  let published = 0
  let eventsEmitted = 0
  const affectedTenants = new Set()

  for (const doc of dueContents) {
    const publishDate = new Date()
    const nextVersion = (doc.version || 0) + 1

    const updated = await Content.findOneAndUpdate(
      { _id: doc._id, status: 'scheduled' },
      {
        $set: {
          status: 'published',
          publishAt: null,
          publishedAt: publishDate,
          publishedBy: null,
          version: nextVersion,
          updatedBy: null
        }
      },
      { new: true }
    )

    if (!updated) {
      continue
    }

    const versionDoc = await ContentVersion.create({
      tenantId: updated.tenantId,
      contentId: updated._id,
      version: nextVersion,
      title: updated.title,
      slug: updated.slug,
      summary: updated.summary,
      lexical: updated.lexical,
      html: updated.html,
      categories: updated.categories,
      tags: updated.tags,
      featuredMediaId: updated.featuredMediaId,
      authorName: updated.authorName,
      publishAt: null,
      publishedAt: publishDate,
      status: updated.status,
      createdBy: updated.createdBy || null,
      publishedBy: null
    })

    updated.lastVersionId = versionDoc._id
    await updated.save()

    published += 1
    const tenantIdString = updated.tenantId?.toString()
    if (tenantIdString) {
      affectedTenants.add(tenantIdString)
    }

    if (tenantIdString) {
      try {
        await emitDomainEvent(tenantIdString, 'content.published', {
          contentId: updated._id?.toString(),
          slug: updated.slug,
          status: updated.status,
          version: updated.version,
          publishedAt: publishDate.toISOString()
        }, {
          triggeredBy: 'system',
          source: 'content-scheduler'
        })
        eventsEmitted += 1
      } catch (error) {
        console.error('[contentService] Failed to emit scheduled publish event', {
          tenantId: tenantIdString,
          contentId: updated._id?.toString(),
          error
        })
      }
    }
  }

  for (const tenantId of affectedTenants) {
    triggerWebhooksForTenant(tenantId)
  }

  return {
    matched: dueContents.length,
    published,
    eventsEmitted
  }
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
  filterPublicCustomFields,
  filterPublicCustomFieldsInList,
  checkSlugAvailability,
  CONTENT_SCHEDULING_DISABLED_CODE,
  setContentGalleries,
  getArchiveStatistics,
  publishDueScheduledContent,
}
