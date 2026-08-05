const {
  Content
} = require('@contexthub/common')
const customFieldDefinitionService = require('../services/customFieldDefinitionService')
const collectionEntryService = require('../services/collectionEntryService')
const collectionTypeService = require('../services/collectionTypeService')

class ExtensionSourceFacadeError extends Error {
  constructor(message, code = 'EXTENSION_SOURCE_INVALID') {
    super(message)
    this.name = 'ExtensionSourceFacadeError'
    this.code = code
  }
}

function requiredString(value, label) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new ExtensionSourceFacadeError(`${label} is required`)
  return normalized
}

function toPlainObject(value) {
  if (!value) return null
  if (typeof value.toObject === 'function') return value.toObject()
  return value
}

function normalizeLocalizedLabel(value) {
  if (typeof value === 'string') return value
  if (value instanceof Map) value = Object.fromEntries(value.entries())
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ''
  for (const key of Object.keys(value).sort()) {
    const label = String(value[key] ?? '').trim()
    if (label) return label
  }
  return ''
}

function serializeCategory(value) {
  const item = toPlainObject(value)
  if (!item) return null
  const name = String(item.name ?? '').trim()
  return name ? Object.freeze({ name }) : null
}

function serializeTag(value) {
  const item = toPlainObject(value)
  if (!item) return null
  const title = normalizeLocalizedLabel(item.title)
  return title ? Object.freeze({ title }) : null
}

function serializeId(value) {
  const item = toPlainObject(value)
  const id = item?._id ?? item?.id
  return id ? String(id) : null
}

function serializeDefinition(value) {
  const definition = toPlainObject(value)
  return Object.freeze({
    key: definition.key,
    type: definition.type,
    public: Boolean(definition.public),
    searchable: Boolean(definition.searchable),
    filterable: Boolean(definition.filterable),
    options: Object.freeze(
      (definition.options || []).map((option) => Object.freeze({
        label: String(option.label ?? ''),
        value: String(option.value ?? '')
      }))
    )
  })
}

async function defaultLoadContent({ tenantId, contentId }) {
  return Content.findOne({ _id: contentId, tenantId })
    .populate({ path: 'categories', match: { tenantId }, select: { name: 1 } })
    .populate({ path: 'tags', match: { tenantId }, select: { title: 1 } })
    .lean()
}

async function defaultLoadContentDefinitions({ tenantId }) {
  return customFieldDefinitionService.listDefinitions({ tenantId })
}

async function defaultLoadCollectionEntry({ tenantId, collectionKey, entryId }) {
  try {
    const [entry, collectionType] = await Promise.all([
      collectionEntryService.getEntry({ tenantId, collectionKey, entryId }),
      collectionTypeService.getCollectionType({ tenantId, key: collectionKey })
    ])
    const item = toPlainObject(entry)
    collectionEntryService.attachEnumLabels({ items: [item], collectionType })
    return item
  } catch (error) {
    if (error?.code === 'EntryNotFound') return null
    throw error
  }
}

function createExtensionSourceFacade(options = {}) {
  const loadContent = options.loadContent || defaultLoadContent
  const loadContentDefinitions =
    options.loadContentDefinitions || defaultLoadContentDefinitions
  const loadCollectionEntry =
    options.loadCollectionEntry || defaultLoadCollectionEntry

  return Object.freeze({
    async getContentSnapshot({ tenantId, contentId } = {}) {
      const normalizedTenantId = requiredString(tenantId, 'tenantId')
      const normalizedContentId = requiredString(contentId, 'contentId')
      const content = await loadContent({
        tenantId: normalizedTenantId,
        contentId: normalizedContentId
      })
      if (!content) return null
      const definitions = await loadContentDefinitions({ tenantId: normalizedTenantId })

      return Object.freeze({
        tenantId: String(content.tenantId),
        id: String(content._id ?? content.id),
        status: content.status,
        title: content.title,
        slug: content.slug,
        summary: content.summary,
        html: content.html,
        lexical: content.lexical,
        categories: Object.freeze((content.categories || []).map(serializeCategory).filter(Boolean)),
        tags: Object.freeze((content.tags || []).map(serializeTag).filter(Boolean)),
        categoryIds: Object.freeze((content.categories || []).map(serializeId).filter(Boolean)),
        tagIds: Object.freeze((content.tags || []).map(serializeId).filter(Boolean)),
        customFields: content.customFields,
        customFieldDefinitions: Object.freeze((definitions || []).map(serializeDefinition)),
        version: content.version,
        updatedAt: content.updatedAt
      })
    },

    async getCollectionEntrySnapshot({ tenantId, collectionKey, entryId } = {}) {
      const normalizedTenantId = requiredString(tenantId, 'tenantId')
      const normalizedCollectionKey = requiredString(collectionKey, 'collectionKey')
      const normalizedEntryId = requiredString(entryId, 'entryId')
      const entry = await loadCollectionEntry({
        tenantId: normalizedTenantId,
        collectionKey: normalizedCollectionKey,
        entryId: normalizedEntryId
      })
      if (!entry) return null

      return Object.freeze({
        tenantId: String(entry.tenantId),
        id: String(entry._id ?? entry.id),
        collectionKey: entry.collectionKey,
        status: entry.status,
        data: entry.data,
        dataLabels: entry.dataLabels,
        updatedAt: entry.updatedAt
      })
    }
  })
}

module.exports = {
  ExtensionSourceFacadeError,
  createExtensionSourceFacade,
  __testables: {
    normalizeLocalizedLabel,
    serializeCategory,
    serializeDefinition,
    serializeId,
    serializeTag
  }
}
