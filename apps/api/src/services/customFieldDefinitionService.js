const { CustomFieldDefinition, ContentCustomFieldIndex, Content } = require('@contexthub/common')
const mongoose = require('mongoose')

const ObjectId = mongoose.Types.ObjectId
const RESERVED_FIELD_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const FIELD_TYPES = new Set([
  'text',
  'number',
  'boolean',
  'date',
  'select',
  'multi-select',
  'url',
  'json',
  'reference'
])

function normalizeFieldKey(value = '') {
  const key = String(value)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
  return RESERVED_FIELD_KEYS.has(key) ? '' : key
}

function normalizeOptions(options = []) {
  if (!Array.isArray(options)) return []
  return options
    .map((option) => {
      if (typeof option === 'string') {
        return { label: option, value: option }
      }
      return {
        label: String(option?.label || option?.value || '').trim(),
        value: String(option?.value || option?.label || '').trim()
      }
    })
    .filter((option) => option.value)
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
    case 'multi-select': {
      const values = Array.isArray(value) ? value.map(normalizeTextValue).filter(Boolean) : []
      if (!values.length) return null
      payload.valueString = values.join(',')
      payload.valueTokens = values
      return payload
    }
    case 'json':
      payload.valueString = JSON.stringify(value)
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

async function rebuildIndexForDefinition({ tenantId, definition }) {
  await ContentCustomFieldIndex.deleteMany({ tenantId, key: definition.key })

  if (!definition.filterable && !definition.searchable) {
    return
  }

  const contents = await Content.find({
    tenantId,
    [`customFields.${definition.key}`]: { $exists: true }
  })
    .select({ _id: 1, status: 1, publishedAt: 1, customFields: 1 })
    .lean()

  const rows = contents
    .map((content) => {
      const indexed = buildIndexValue(definition, content.customFields?.[definition.key])
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
    await ContentCustomFieldIndex.insertMany(rows, { ordered: false })
  }
}

function normalizeDefinitionPayload(payload = {}) {
  const key = normalizeFieldKey(payload.key)
  if (!key) {
    throw new Error('Field key is required')
  }

  const type = FIELD_TYPES.has(payload.type) ? payload.type : 'text'
  const label = String(payload.label || key).trim()
  if (!label) {
    throw new Error('Field label is required')
  }

  return {
    key,
    label,
    type,
    description: String(payload.description || '').trim(),
    required: Boolean(payload.required),
    public: Boolean(payload.public),
    filterable: Boolean(payload.filterable),
    searchable: Boolean(payload.searchable),
    options: normalizeOptions(payload.options),
    referenceCollectionKey: String(payload.referenceCollectionKey || '').trim(),
    defaultValue: payload.defaultValue,
    position: Number.isFinite(Number(payload.position)) ? Number(payload.position) : 0
  }
}

async function listDefinitions({ tenantId, publicOnly = false } = {}) {
  const query = { tenantId }
  if (publicOnly) {
    query.public = true
  }

  return CustomFieldDefinition.find(query)
    .sort({ position: 1, label: 1, key: 1 })
    .lean()
}

async function createDefinition({ tenantId, userId, payload }) {
  const normalized = normalizeDefinitionPayload(payload)
  const existing = await CustomFieldDefinition.exists({ tenantId, key: normalized.key })
  if (existing) {
    throw new Error('A custom field with this key already exists')
  }

  const definition = await CustomFieldDefinition.create({
    tenantId,
    ...normalized,
    createdBy: userId && ObjectId.isValid(userId) ? new ObjectId(userId) : null,
    updatedBy: userId && ObjectId.isValid(userId) ? new ObjectId(userId) : null
  }).then((doc) => doc.toObject())

  await rebuildIndexForDefinition({ tenantId, definition })
  return definition
}

async function updateDefinition({ tenantId, definitionId, userId, payload }) {
  if (!ObjectId.isValid(definitionId)) {
    throw new Error('Invalid custom field definition id')
  }

  const existing = await CustomFieldDefinition.findOne({ tenantId, _id: definitionId })
  if (!existing) {
    throw new Error('Custom field definition not found')
  }

  const normalized = normalizeDefinitionPayload({
    ...existing.toObject(),
    ...payload,
    key: existing.key
  })

  const updated = await CustomFieldDefinition.findOneAndUpdate(
    { tenantId, _id: definitionId },
    {
      $set: {
        ...normalized,
        key: existing.key,
        updatedBy: userId && ObjectId.isValid(userId) ? new ObjectId(userId) : null
      }
    },
    { new: true }
  ).lean()

  await rebuildIndexForDefinition({ tenantId, definition: updated })
  return updated
}

async function deleteDefinition({ tenantId, definitionId }) {
  if (!ObjectId.isValid(definitionId)) {
    throw new Error('Invalid custom field definition id')
  }

  const definition = await CustomFieldDefinition.findOne({ tenantId, _id: definitionId }).lean()
  if (!definition) {
    return { deleted: 0 }
  }

  const result = await CustomFieldDefinition.deleteOne({ tenantId, _id: definitionId })
  await ContentCustomFieldIndex.deleteMany({ tenantId, key: definition.key })
  return { deleted: result.deletedCount }
}

module.exports = {
  normalizeFieldKey,
  listDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition
}
