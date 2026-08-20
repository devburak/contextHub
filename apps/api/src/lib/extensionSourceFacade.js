const common = require('@contexthub/common')
const { Content, Media, Tenant, mongoose } = common
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

const TENANT_BACKUP_MODEL_NAMES = Object.freeze([
  'Domain',
  'User',
  'Membership',
  'ContentType',
  'Entry',
  'EntryRevision',
  'Taxonomy',
  'Term',
  'Tag',
  'Navigation',
  'Media',
  'Category',
  'FormDefinition',
  'FormResponse',
  'FormVersion',
  'Event',
  'DailyAgg',
  'ApiToken',
  'Product',
  'CollectionType',
  'CollectionEntry',
  'Template',
  'Content',
  'ContentVersion',
  'CustomFieldDefinition',
  'ContentCustomFieldIndex',
  'TenantSettings',
  'Gallery',
  'PlacementDefinition',
  'PlacementEvent',
  'Menu',
  'Role',
  'Webhook',
  'WebhookOutbox',
  'ActivityLog',
  'DomainEvent',
  'DomainEventCounter',
  'DomainEventCursor',
  'DomainEventDeadLetter',
  'ExtensionTenantSetting'
])

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

function serializeBackupDocument(value) {
  return mongoose.mongo.BSON.EJSON.serialize(value, { relaxed: false })
}

function backupRecord(model, document) {
  const tenantId = document.tenantId ?? document._id
  return Object.freeze({
    collection: model.collection.collectionName,
    id: String(document._id),
    tenantId: String(tenantId),
    document: serializeBackupDocument(document)
  })
}

async function* defaultStreamTenantBackupRecords({ tenantId }) {
  const tenant = await Tenant.findOne({ _id: tenantId }).lean()
  if (!tenant) {
    throw new ExtensionSourceFacadeError('tenant was not found', 'EXTENSION_BACKUP_TENANT_NOT_FOUND')
  }
  yield backupRecord(Tenant, tenant)

  for (const modelName of TENANT_BACKUP_MODEL_NAMES) {
    const model = common[modelName]
    if (!model?.schema?.path('tenantId')) continue
    const cursor = model.find({ tenantId }).lean().cursor()
    for await (const document of cursor) {
      if (String(document.tenantId) !== tenantId) {
        throw new ExtensionSourceFacadeError(
          `tenant boundary violation while exporting ${modelName}`,
          'EXTENSION_BACKUP_TENANT_BOUNDARY_VIOLATION'
        )
      }
      yield backupRecord(model, document)
    }
  }
}

function normalizeBackupFile(media, value, variant = null) {
  const key = requiredString(value?.key, 'file key')
  const tenantSlug = requiredString(media.tenantSlug, 'media tenantSlug')
  if (!key.startsWith(`${tenantSlug}/`)) {
    throw new ExtensionSourceFacadeError(
      'media storage key does not match its tenant namespace',
      'EXTENSION_BACKUP_FILE_BOUNDARY_VIOLATION'
    )
  }
  return Object.freeze({
    tenantId: String(media.tenantId),
    key,
    bucket: requiredString(media.bucket, 'file bucket'),
    size: Number(value.size || 0),
    etag: String(value.etag || media.etag || ''),
    checksum: String(value.checksum || ''),
    mimeType: String(value.mimeType || media.mimeType || 'application/octet-stream'),
    mediaId: String(media._id),
    variant
  })
}

async function defaultListTenantBackupFiles({ tenantId }) {
  const mediaItems = await Media.find({ tenantId, sourceType: { $ne: 'external' } }).lean()
  const files = []
  const keys = new Set()
  for (const media of mediaItems) {
    if (String(media.tenantId) !== tenantId) {
      throw new ExtensionSourceFacadeError(
        'tenant boundary violation while listing media',
        'EXTENSION_BACKUP_TENANT_BOUNDARY_VIOLATION'
      )
    }
    for (const file of [
      media.key ? normalizeBackupFile(media, media) : null,
      ...(media.variants || []).map((variant) => normalizeBackupFile(media, variant, variant.name))
    ].filter(Boolean)) {
      if (keys.has(file.key)) continue
      keys.add(file.key)
      files.push(file)
    }
  }
  return Object.freeze(files.sort((left, right) => left.key.localeCompare(right.key)))
}

async function defaultOpenTenantBackupFile({ tenantId, key }) {
  const media = await Media.findOne({
    tenantId,
    sourceType: { $ne: 'external' },
    $or: [{ key }, { 'variants.key': key }]
  }).lean()
  if (!media || String(media.tenantId) !== tenantId) {
    throw new ExtensionSourceFacadeError(
      'tenant-scoped media file was not found',
      'EXTENSION_BACKUP_FILE_NOT_FOUND'
    )
  }
  const tenantSlug = requiredString(media.tenantSlug, 'media tenantSlug')
  if (!key.startsWith(`${tenantSlug}/`)) {
    throw new ExtensionSourceFacadeError(
      'media storage key does not match its tenant namespace',
      'EXTENSION_BACKUP_FILE_BOUNDARY_VIOLATION'
    )
  }
  const mediaService = require('../services/mediaService')
  return mediaService.openTenantBackupFile({ tenantId, key })
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
  const streamTenantBackupRecords =
    options.streamTenantBackupRecords || defaultStreamTenantBackupRecords
  const listTenantBackupFiles =
    options.listTenantBackupFiles || defaultListTenantBackupFiles
  const openTenantBackupFile =
    options.openTenantBackupFile || defaultOpenTenantBackupFile

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
    },

    streamTenantBackupRecords({ tenantId } = {}) {
      const normalizedTenantId = requiredString(tenantId, 'tenantId')
      return streamTenantBackupRecords({ tenantId: normalizedTenantId })
    },

    async listTenantBackupFiles({ tenantId } = {}) {
      const normalizedTenantId = requiredString(tenantId, 'tenantId')
      return listTenantBackupFiles({ tenantId: normalizedTenantId })
    },

    async openTenantBackupFile({ tenantId, key } = {}) {
      const normalizedTenantId = requiredString(tenantId, 'tenantId')
      const normalizedKey = requiredString(key, 'key')
      return openTenantBackupFile({ tenantId: normalizedTenantId, key: normalizedKey })
    }
  })
}

module.exports = {
  ExtensionSourceFacadeError,
  createExtensionSourceFacade,
  __testables: {
    TENANT_BACKUP_MODEL_NAMES,
    backupRecord,
    normalizeBackupFile,
    normalizeLocalizedLabel,
    serializeBackupDocument,
    serializeCategory,
    serializeDefinition,
    serializeId,
    serializeTag
  }
}
