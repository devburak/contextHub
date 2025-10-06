const { Category } = require('@contexthub/common')
const mongoose = require('mongoose')

const ObjectId = mongoose.Types.ObjectId

const TURKISH_CHAR_MAP = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', Â: 'a'
}

function transliterate(value = '') {
  return value
    .split('')
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join('')
}

function slugify(input = '') {
  return transliterate(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function assertUniqueSlug({ tenantId, slug, excludeId }) {
  const query = { tenantId, slug }
  if (excludeId) {
    query._id = { $ne: excludeId }
  }
  const exists = await Category.exists(query)
  if (exists) {
    throw new Error('Slug already in use for this tenant')
  }
}

async function resolveParent({ tenantId, parentId, categoryId }) {
  if (!parentId) return { parent: null, ancestors: [] }

  if (!ObjectId.isValid(parentId)) {
    throw new Error('Invalid parent category id')
  }

  const parent = await Category.findOne({ _id: parentId, tenantId })
  if (!parent) {
    throw new Error('Parent category not found')
  }

  if (categoryId && parent._id.equals(categoryId)) {
    throw new Error('Category cannot be its own parent')
  }

  const ancestors = [...(parent.ancestors || []), parent._id]
  if (categoryId && ancestors.some((ancestorId) => ancestorId.equals(categoryId))) {
    throw new Error('Circular category hierarchy detected')
  }

  return { parent, ancestors }
}

async function computePosition({ tenantId, parentId }) {
  const lastSibling = await Category.findOne({ tenantId, parentId: parentId || null })
    .sort({ position: -1 })
    .select('position')
  return typeof lastSibling?.position === 'number' ? lastSibling.position + 1 : 0
}

async function createCategory({ tenantId, userId, payload }) {
  const {
    name,
    slug,
    parentId = null,
    description = '',
    defaultSortField = 'createdAt',
    defaultSortOrder = 'desc',
    position,
    settings,
    metadata,
  } = payload

  if (!name) {
    throw new Error('Name is required')
  }

  const finalSlug = slugify(slug || name)
  if (!finalSlug) {
    throw new Error('Slug is required')
  }

  await assertUniqueSlug({ tenantId, slug: finalSlug })

  const { parent, ancestors } = await resolveParent({ tenantId, parentId })

  const category = await Category.create({
    tenantId,
    name,
    slug: finalSlug,
    description,
    parentId: parent ? parent._id : null,
    ancestors,
    position: typeof position === 'number' ? position : await computePosition({ tenantId, parentId: parent ? parent._id : null }),
    defaultSortField,
    defaultSortOrder,
    settings,
    metadata,
    ...(userId ? { createdBy: new ObjectId(userId), updatedBy: new ObjectId(userId) } : {}),
  })

  return category.toObject()
}

async function updateCategory({ tenantId, categoryId, userId, payload }) {
  if (!ObjectId.isValid(categoryId)) {
    throw new Error('Invalid category id')
  }

  const category = await Category.findOne({ _id: categoryId, tenantId })
  if (!category) {
    throw new Error('Category not found')
  }

  const update = {}

  if (payload.name !== undefined) {
    if (!payload.name) {
      throw new Error('Name cannot be empty')
    }
    update.name = payload.name
  }

  if (payload.slug !== undefined) {
    const finalSlug = slugify(payload.slug || update.name || category.name)
    if (!finalSlug) {
      throw new Error('Slug is required')
    }
    await assertUniqueSlug({ tenantId, slug: finalSlug, excludeId: category._id })
    update.slug = finalSlug
  }

  if (payload.description !== undefined) {
    update.description = payload.description
  }

  if (payload.defaultSortField !== undefined) {
    update.defaultSortField = payload.defaultSortField
  }

  if (payload.defaultSortOrder !== undefined) {
    update.defaultSortOrder = payload.defaultSortOrder === 'asc' ? 'asc' : 'desc'
  }

  if (payload.settings !== undefined) {
    update.settings = payload.settings
  }

  if (payload.metadata !== undefined) {
    update.metadata = payload.metadata
  }

  let parentChanged = false
  if (payload.parentId !== undefined) {
    const parentId = payload.parentId || null
    const { parent, ancestors } = await resolveParent({ tenantId, parentId, categoryId: category._id })
    update.parentId = parent ? parent._id : null
    update.ancestors = ancestors
    parentChanged = true
  }

  if (payload.position !== undefined && typeof payload.position === 'number') {
    update.position = payload.position
  }

  if (userId) {
    update.updatedBy = new ObjectId(userId)
  }

  const updated = await Category.findOneAndUpdate(
    { _id: category._id, tenantId },
    { $set: update },
    { new: true }
  )

  if (!updated) {
    throw new Error('Category update failed')
  }

  if (parentChanged) {
    await updateDescendantAncestors(updated)
  }

  return updated.toObject()
}

async function updateDescendantAncestors(category) {
  const descendants = await Category.find({ ancestors: category._id })
  if (!descendants.length) return

  for (const item of descendants) {
    const { ancestors } = await resolveParent({ tenantId: item.tenantId, parentId: item.parentId, categoryId: item._id })
    item.ancestors = ancestors
    await item.save()
  }
}

async function deleteCategory({ tenantId, categoryId, cascade = true }) {
  if (!ObjectId.isValid(categoryId)) {
    throw new Error('Invalid category id')
  }

  const category = await Category.findOne({ _id: categoryId, tenantId })
  if (!category) {
    return { deleted: 0 }
  }

  const idsToDelete = [category._id]
  if (cascade) {
    const descendants = await Category.find({ tenantId, ancestors: category._id }).select('_id')
    descendants.forEach((doc) => idsToDelete.push(doc._id))
  } else {
    const childExists = await Category.exists({ tenantId, parentId: category._id })
    if (childExists) {
      throw new Error('Cannot delete category with children')
    }
  }

  const result = await Category.deleteMany({ tenantId, _id: { $in: idsToDelete } })

  return { deleted: result.deletedCount || 0 }
}

async function getCategory({ tenantId, categoryId }) {
  if (!ObjectId.isValid(categoryId)) {
    throw new Error('Invalid category id')
  }

  const category = await Category.findOne({ _id: categoryId, tenantId })
  if (!category) {
    throw new Error('Category not found')
  }

  return category.toObject()
}

function buildTree(documents) {
  const nodesById = new Map()
  const roots = []

  documents.forEach((doc) => {
    const node = { ...doc, children: [] }
    nodesById.set(String(doc._id), node)
  })

  documents.forEach((doc) => {
    const node = nodesById.get(String(doc._id))
    if (doc.parentId) {
      const parentNode = nodesById.get(String(doc.parentId))
      if (parentNode) {
        parentNode.children.push(node)
      } else {
        roots.push(node)
      }
    } else {
      roots.push(node)
    }
  })

  const sortNested = (list) => {
    list.sort((a, b) => {
      const positionDiff = (a.position || 0) - (b.position || 0)
      if (positionDiff !== 0) return positionDiff
      return a.name.localeCompare(b.name)
    })
    list.forEach((node) => sortNested(node.children))
  }

  sortNested(roots)
  return roots
}

function escapeRegExp(value = '') {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

async function listCategories({ tenantId, flat = false, search, page, limit, ids }) {
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
    query.$or = [{ name: regex }, { slug: regex }]
  }

  const sort = { position: 1, name: 1 }
  let cursor = Category.find(query).sort(sort)

  let pagination = null
  const limitValue = Number(limit)
  const shouldPaginate = Number.isFinite(limitValue) && limitValue > 0 && !query._id

  if (shouldPaginate) {
    const pageValue = Number(page)
    const currentPage = Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1
    const finalLimit = Math.min(Math.floor(limitValue), 100)
    const skip = (currentPage - 1) * finalLimit
    const total = await Category.countDocuments(query)
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

  const categories = flat ? docs : buildTree(docs)

  return { categories, pagination }
}

module.exports = {
  createCategory,
  updateCategory,
  deleteCategory,
  getCategory,
  listCategories,
}
