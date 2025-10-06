const { Tag } = require('@contexthub/common')
const mongoose = require('mongoose')

const ObjectId = mongoose.Types.ObjectId

const TURKISH_CHAR_MAP = {
  ç: 'c', Ç: 'c',
  ğ: 'g', Ğ: 'g',
  ı: 'i', I: 'i', İ: 'i',
  ö: 'o', Ö: 'o',
  ş: 's', Ş: 's',
  ü: 'u', Ü: 'u',
  â: 'a', Â: 'a',
}

function transliterate(value = '') {
  return value
    .split('')
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join('')
}

function slugify(value = '') {
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

function escapeRegExp(value = '') {
  return value.replace(/[-\\/^$*+?.()|[\]{}]/g, '\\$&')
}

async function listTags({ tenantId, search, page, limit, ids }) {
  const query = { tenantId }

  if (Array.isArray(ids) && ids.length) {
    const validIds = ids
      .map((value) => (ObjectId.isValid(value) ? new ObjectId(value) : null))
      .filter(Boolean)
    if (validIds.length) {
      query._id = { $in: validIds }
    }
  }

  if (search) {
    const escaped = escapeRegExp(search)
    const regex = new RegExp(escaped, 'i')
    query.$or = [{ title: regex }, { slug: regex }]
  }

  const sort = { title: 1 }
  let cursor = Tag.find(query).sort(sort)
  let pagination = null

  const limitValue = Number(limit)
  const shouldPaginate = Number.isFinite(limitValue) && limitValue > 0 && !query._id

  if (shouldPaginate) {
    const pageValue = Number(page)
    const currentPage = Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1
    const finalLimit = Math.min(Math.floor(limitValue), 100)
    const skip = (currentPage - 1) * finalLimit
    const total = await Tag.countDocuments(query)
    cursor = cursor.skip(skip).limit(finalLimit)
    pagination = {
      page: currentPage,
      limit: finalLimit,
      total,
      pages: Math.max(1, Math.ceil(total / finalLimit)),
    }
  }

  const docs = await cursor.lean()

  if (!pagination && (!ids || !ids.length)) {
    pagination = {
      page: 1,
      limit: docs.length,
      total: docs.length,
      pages: 1,
    }
  }

  return { tags: docs, pagination }
}

async function findOrCreateTag({ tenantId, title, userId }) {
  if (!title || !title.trim()) {
    throw new Error('Title is required')
  }

  const baseSlug = slugify(title)
  if (!baseSlug) {
    throw new Error('Slug is required')
  }

  let candidateSlug = baseSlug
  let suffix = 1
  let existing = await Tag.findOne({ tenantId, slug: candidateSlug })

  while (existing && existing.title !== undefined && existing.title.toLowerCase() !== title.toLowerCase()) {
    candidateSlug = `${baseSlug}-${suffix}`
    suffix += 1
    existing = await Tag.findOne({ tenantId, slug: candidateSlug })
  }

  if (existing) {
    return existing.toObject()
  }

  const tag = await Tag.create({
    tenantId,
    slug: candidateSlug,
    title,
    ...(userId ? { createdBy: new ObjectId(userId), updatedBy: new ObjectId(userId) } : {}),
  })

  return tag.toObject()
}

module.exports = {
  listTags,
  findOrCreateTag,
}
