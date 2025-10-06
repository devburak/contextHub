const { Content, Media, FormDefinition, Membership, User, mongoose } = require('@contexthub/common')

const { Types: { ObjectId } } = mongoose

function toObjectId(value, fieldName = 'identifier') {
  if (!value) {
    throw new Error(`Missing ${fieldName}`)
  }

  if (value instanceof ObjectId) {
    return value
  }

  if (ObjectId.isValid(value)) {
    return new ObjectId(value)
  }

  throw new Error(`Invalid ${fieldName}`)
}

function ensureArray(value) {
  if (!Array.isArray(value)) {
    return []
  }
  return value
}

function extractText(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'object') {
    const preferredOrder = ['tr', 'en']
    for (const key of preferredOrder) {
      if (value[key]) {
        return String(value[key])
      }
    }

    const firstValue = Object.values(value).find(Boolean)
    if (firstValue) {
      return String(firstValue)
    }
  }

  return ''
}

function resolveActorId(document) {
  const updatedBy = document.updatedBy?.toString?.()
  if (updatedBy) {
    return updatedBy
  }

  const createdBy = document.createdBy?.toString?.()
  if (createdBy) {
    return createdBy
  }

  return null
}

function inferAction(document) {
  if (!document) {
    return 'updated'
  }

  const createdAt = document.createdAt instanceof Date ? document.createdAt : null
  const updatedAt = document.updatedAt instanceof Date ? document.updatedAt : null

  if (!createdAt || !updatedAt) {
    return 'updated'
  }

  const delta = updatedAt.getTime() - createdAt.getTime()

  return delta > 1500 ? 'updated' : 'created'
}

function toTimestamp(document) {
  if (document.updatedAt instanceof Date) {
    return document.updatedAt
  }
  if (document.createdAt instanceof Date) {
    return document.createdAt
  }
  return new Date()
}

async function getSummary({ tenantId }) {
  const tenantObjectId = toObjectId(tenantId, 'tenantId')

  const [userCount, contentCount, mediaAggregate] = await Promise.all([
    Membership.countDocuments({ tenantId: tenantObjectId, status: { $ne: 'inactive' } }),
    Content.countDocuments({ tenantId: tenantObjectId }),
    Media.aggregate([
      { $match: { tenantId: tenantObjectId, status: { $ne: 'deleted' } } },
      {
        $group: {
          _id: null,
          totalSize: { $sum: { $ifNull: ['$size', 0] } },
          count: { $sum: 1 },
        },
      },
    ]),
  ])

  const [{ totalSize = 0, count = 0 } = {}] = mediaAggregate

  return {
    totals: {
      users: userCount,
      contents: contentCount,
      media: {
        count,
        totalSize,
      },
    },
  }
}

async function fetchContentActivities({ tenantId, actorId, includeAllMembers, limit }) {
  const match = { tenantId }

  if (!includeAllMembers && actorId) {
    match.$or = [
      { createdBy: actorId },
      { updatedBy: actorId },
    ]
  }

  const documents = await Content.find(match)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select({
      title: 1,
      slug: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
      createdBy: 1,
      updatedBy: 1,
    })
    .lean()

  return documents.map((document) => {
    const timestamp = toTimestamp(document)
    const actorIdStr = resolveActorId(document)
    return {
      id: `content:${document._id.toString()}:${timestamp.getTime()}`,
      entityId: document._id.toString(),
      entityType: 'content',
      action: inferAction(document),
      title: document.title || 'Başlıksız İçerik',
      timestamp: timestamp.toISOString(),
      actorId: actorIdStr,
      metadata: {
        slug: document.slug,
        status: document.status,
      },
    }
  })
}

async function fetchMediaActivities({ tenantId, actorId, includeAllMembers, limit }) {
  const match = { tenantId, status: { $ne: 'deleted' } }

  if (!includeAllMembers && actorId) {
    match.$or = [
      { createdBy: actorId },
      { updatedBy: actorId },
    ]
  }

  const documents = await Media.find(match)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select({
      originalName: 1,
      fileName: 1,
      mimeType: 1,
      size: 1,
      status: 1,
      sourceType: 1,
      createdAt: 1,
      updatedAt: 1,
      createdBy: 1,
      updatedBy: 1,
    })
    .lean()

  return documents.map((document) => {
    const timestamp = toTimestamp(document)
    const actorIdStr = resolveActorId(document)
    const displayName = document.originalName || document.fileName || 'Adsız dosya'
    return {
      id: `media:${document._id.toString()}:${timestamp.getTime()}`,
      entityId: document._id.toString(),
      entityType: 'media',
      action: inferAction(document),
      title: displayName,
      timestamp: timestamp.toISOString(),
      actorId: actorIdStr,
      metadata: {
        mimeType: document.mimeType || null,
        size: typeof document.size === 'number' ? document.size : null,
        status: document.status,
        sourceType: document.sourceType,
      },
    }
  })
}

async function fetchFormActivities({ tenantId, actorId, includeAllMembers, limit }) {
  const match = { tenantId }

  if (!includeAllMembers && actorId) {
    match.$or = [
      { createdBy: actorId },
      { updatedBy: actorId },
    ]
  }

  const documents = await FormDefinition.find(match)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select({
      title: 1,
      slug: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
      createdBy: 1,
      updatedBy: 1,
    })
    .lean()

  return documents.map((document) => {
    const timestamp = toTimestamp(document)
    const actorIdStr = resolveActorId(document)
    const title = extractText(document.title) || 'Başlıksız Form'

    return {
      id: `form:${document._id.toString()}:${timestamp.getTime()}`,
      entityId: document._id.toString(),
      entityType: 'form',
      action: inferAction(document),
      title,
      timestamp: timestamp.toISOString(),
      actorId: actorIdStr,
      metadata: {
        slug: document.slug,
        status: document.status,
      },
    }
  })
}

async function getRecentActivities({
  tenantId,
  actorId,
  includeAllMembers = false,
  type,
  limit = 10,
  offset = 0,
}) {
  const tenantObjectId = toObjectId(tenantId, 'tenantId')
  const actorObjectId = actorId ? toObjectId(actorId, 'actorId') : null

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 50)
  const safeOffset = Math.max(Number(offset) || 0, 0)
  const fetchLimit = safeOffset + safeLimit + 5

  const allowedTypes = ['content', 'media', 'form']
  const requestedTypes = type ? [type].filter((value) => allowedTypes.includes(value)) : allowedTypes

  const fetchJobs = requestedTypes.map((currentType) => {
    switch (currentType) {
      case 'content':
        return fetchContentActivities({
          tenantId: tenantObjectId,
          actorId: actorObjectId,
          includeAllMembers,
          limit: fetchLimit,
        })
      case 'media':
        return fetchMediaActivities({
          tenantId: tenantObjectId,
          actorId: actorObjectId,
          includeAllMembers,
          limit: fetchLimit,
        })
      case 'form':
        return fetchFormActivities({
          tenantId: tenantObjectId,
          actorId: actorObjectId,
          includeAllMembers,
          limit: fetchLimit,
        })
      default:
        return Promise.resolve([])
    }
  })

  const results = await Promise.all(fetchJobs)
  const combined = results.flat()
  combined.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const paginatedSlice = combined.slice(safeOffset, safeOffset + safeLimit + 1)
  const items = paginatedSlice.slice(0, safeLimit)
  const hasMore = paginatedSlice.length > safeLimit

  const actorIds = ensureArray(items.map((item) => item.actorId).filter(Boolean))
  const uniqueActorIds = [...new Set(actorIds)]

  let actorMap = new Map()
  if (uniqueActorIds.length) {
    const actorObjectIds = uniqueActorIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id))

    if (actorObjectIds.length) {
      const users = await User.find({ _id: { $in: actorObjectIds } })
        .select({ firstName: 1, lastName: 1, name: 1, email: 1 })
        .lean()

      actorMap = new Map(
        users.map((user) => {
          const displayName = user.name
            || [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
            || user.email
            || 'Bilinmeyen Kullanıcı'

          return [user._id.toString(), {
            id: user._id.toString(),
            name: displayName,
            email: user.email || null,
          }]
        })
      )
    }
  }

  const resolvedItems = items.map((item) => ({
    ...item,
    actor: item.actorId ? actorMap.get(item.actorId) || null : null,
  }))

  return {
    items: resolvedItems,
    pagination: {
      limit: safeLimit,
      offset: safeOffset,
      hasMore,
    },
    availableTypes: allowedTypes,
  }
}

module.exports = {
  getSummary,
  getRecentActivities,
}
