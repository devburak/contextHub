const mongoose = require('mongoose');
const { CollectionEntry, Media, Content } = require('@contexthub/common');
const {
  getCollectionType
} = require('./collectionTypeService');

const ObjectId = mongoose.Types.ObjectId;

const TURKISH_CHAR_MAP = {
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', I: 'i', İ: 'i', ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u', â: 'a', Â: 'a'
};

function transliterate(value = '') {
  return value
    .split('')
    .map((char) => TURKISH_CHAR_MAP[char] ?? char)
    .join('');
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
    .replace(/^-+|-+$/g, '');
}

function toObjectId(id) {
  if (!id) return undefined;
  if (id instanceof ObjectId) return id;
  return ObjectId.isValid(id) ? new ObjectId(id) : undefined;
}

function toObjectIdList(values = []) {
  if (!Array.isArray(values)) {
    const id = toObjectId(values);
    return id ? [id] : [];
  }
  return values.map(toObjectId).filter(Boolean);
}

function normaliseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function normaliseDate(value) {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normaliseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function ensureEnumValue(field, value) {
  const options = (field.options || []).map((option) => option.value);
  if (!options.length) {
    return value;
  }
  if (Array.isArray(value)) {
    const valid = value.filter((v) => options.includes(v));
    return valid;
  }
  return options.includes(value) ? value : undefined;
}

function ensureGeoJson(value) {
  if (!value || typeof value !== 'object') return undefined;
  const { type, coordinates } = value;
  if (!type || !Array.isArray(coordinates)) return undefined;
  return { type, coordinates };
}

function normaliseFieldValue(field, value) {
  switch (field.type) {
    case 'string':
    case 'text':
      return typeof value === 'string' ? value : value != null ? String(value) : undefined;
    case 'number':
      return normaliseNumber(value);
    case 'boolean':
      return normaliseBoolean(value);
    case 'date':
    case 'datetime':
      return normaliseDate(value);
    case 'enum': {
      const normalised = ensureEnumValue(field, value);
      if (field.settings?.multiple) {
        return Array.isArray(normalised) ? normalised : normalised !== undefined ? [normalised] : undefined;
      }
      if (Array.isArray(normalised)) {
        return normalised[0];
      }
      return normalised;
    }
    case 'ref': {
      if (field.settings?.multiple) {
        const ids = toObjectIdList(value);
        return ids.length ? ids : undefined;
      }
      const id = toObjectId(Array.isArray(value) ? value[0] : value);
      return id || undefined;
    }
    case 'media': {
      if (field.settings?.multiple) {
        const ids = toObjectIdList(value);
        return ids.length ? ids : undefined;
      }
      const id = toObjectId(Array.isArray(value) ? value[0] : value);
      return id || undefined;
    }
    case 'geojson':
      return ensureGeoJson(value);
    default:
      return value;
  }
}

function normaliseRelations(relations = {}) {
  return {
    contents: toObjectIdList(relations.contents),
    media: toObjectIdList(relations.media),
    refs: Array.isArray(relations.refs)
      ? relations.refs
          .map((ref) => ({
            collectionKey: ref.collectionKey,
            entryId: toObjectId(ref.entryId),
            relationType: ref.relationType
          }))
          .filter((ref) => Boolean(ref.collectionKey) && Boolean(ref.entryId))
      : []
  };
}

function mergeRelations(existing = {}, incoming = {}) {
  return {
    contents: Object.prototype.hasOwnProperty.call(incoming, 'contents') ? incoming.contents : existing.contents,
    media: Object.prototype.hasOwnProperty.call(incoming, 'media') ? incoming.media : existing.media,
    refs: Object.prototype.hasOwnProperty.call(incoming, 'refs') ? incoming.refs : existing.refs
  };
}

function buildIndexedSnapshot(collectionType, data) {
  const snapshot = {};
  const fields = collectionType.fields || [];

  const titleField = fields.find((field) => field.indexed && ['string', 'text'].includes(field.type));
  if (titleField && data[titleField.key]) {
    snapshot.title = data[titleField.key];
  }

  if (!snapshot.title) {
    const slugField = collectionType.settings?.slugField;
    if (slugField && data[slugField]) {
      snapshot.title = data[slugField];
    }
  }

  const dateField = fields.find((field) => field.indexed && (field.type === 'date' || field.type === 'datetime'));
  if (dateField && data[dateField.key]) {
    snapshot.date = data[dateField.key];
  }

  const tagFields = fields.filter((field) => field.indexed && field.type === 'enum');
  if (tagFields.length) {
    const tagSet = new Set();
    for (const field of tagFields) {
      const value = data[field.key];
      if (Array.isArray(value)) {
        value.forEach((v) => tagSet.add(String(v)));
      } else if (value !== undefined && value !== null) {
        tagSet.add(String(value));
      }
    }
    if (tagSet.size) {
      snapshot.tags = Array.from(tagSet);
    }
  }

  const geoField = fields.find((field) => field.indexed && field.type === 'geojson');
  if (geoField && data[geoField.key]) {
    snapshot.geo = data[geoField.key];
  }

  return snapshot;
}

async function slugExists({ tenantId, collectionKey, slug, excludeId }) {
  const query = { tenantId, collectionKey, slug };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }
  const exists = await CollectionEntry.exists(query);
  return Boolean(exists);
}

async function generateUniqueSlug({ tenantId, collectionKey, baseSlug, excludeId }) {
  if (!baseSlug) return undefined;
  let candidate = baseSlug;
  let counter = 1;
  while (await slugExists({ tenantId, collectionKey, slug: candidate, excludeId })) {
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }
  return candidate;
}

async function normaliseAndValidateData({ collectionType, data }) {
  const output = {};
  const errors = [];
  const fields = collectionType.fields || [];

  for (const field of fields) {
    const rawValue = data?.[field.key];
    const hasValue = rawValue !== undefined && rawValue !== null && rawValue !== '';

    if (!hasValue) {
      if (field.required) {
        errors.push({ field: field.key, message: 'Field is required' });
      }
      continue;
    }

    const normalisedValue = normaliseFieldValue(field, rawValue);

    if (normalisedValue === undefined || normalisedValue === null || (Array.isArray(normalisedValue) && !normalisedValue.length)) {
      errors.push({ field: field.key, message: `Invalid value for type ${field.type}` });
      continue;
    }

    output[field.key] = normalisedValue;
  }

  if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      if (output[key] !== undefined) continue;
      const fieldExists = fields.some((field) => field.key === key);
      if (!fieldExists) {
        output[key] = data[key];
      }
    }
  }

  return { data: output, errors };
}

async function ensureUniqueFields({ tenantId, collectionKey, fields, data, excludeId }) {
  const uniqueFields = fields.filter((field) => field.unique);
  for (const field of uniqueFields) {
    const value = data[field.key];
    if (value === undefined || value === null) continue;
    const query = {
      tenantId,
      collectionKey,
      [`data.${field.key}`]: value
    };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    const exists = await CollectionEntry.exists(query);
    if (exists) {
      const error = new Error(`Field '${field.key}' must be unique`);
      error.code = 'UniqueFieldViolation';
      error.field = field.key;
      throw error;
    }
  }
}

async function resolveSlug({ collectionType, tenantId, collectionKey, payload, data, excludeId }) {
  const slugField = collectionType.settings?.slugField;
  const providedSlug = payload.slug ? slugify(payload.slug) : undefined;
  const baseSlug = providedSlug || (slugField && data[slugField] ? slugify(String(data[slugField])) : undefined);
  if (!baseSlug) return undefined;
  const uniqueSlug = await generateUniqueSlug({ tenantId, collectionKey, baseSlug, excludeId });
  return uniqueSlug;
}

function resolveSort(sortParam, collectionType) {
  if (!sortParam || typeof sortParam !== 'string') {
    const { defaultSort } = collectionType.settings || {};
    if (defaultSort?.key) {
      return {
        [resolveSortKey(defaultSort.key, collectionType)]: defaultSort.dir === 'asc' ? 1 : -1
      };
    }
    return { createdAt: -1 };
  }

  let direction = 1;
  let key = sortParam;

  if (sortParam.startsWith('-')) {
    direction = -1;
    key = sortParam.slice(1);
  } else if (sortParam.includes(':')) {
    const [providedKey, providedDir] = sortParam.split(':');
    key = providedKey;
    direction = providedDir === 'asc' ? 1 : -1;
  }

  const resolvedKey = resolveSortKey(key, collectionType);
  return { [resolvedKey]: direction };
}

function resolveSortKey(key, collectionType) {
  if (!key) return 'createdAt';

  if (['createdAt', 'updatedAt', 'slug', 'status'].includes(key)) {
    return key;
  }

  if (key === 'title') {
    return 'indexed.title';
  }
  if (key === 'date') {
    return 'indexed.date';
  }

  const fieldExists = (collectionType.fields || []).some((field) => field.key === key);
  if (fieldExists) {
    return `data.${key}`;
  }

  return 'createdAt';
}

async function listEntries({ tenantId, collectionKey, query }) {
  const collectionType = await getCollectionType({ tenantId, key: collectionKey });

  const { page = 1, limit = 20, status, q, filter = {}, sort } = query;
  const criteria = { tenantId, collectionKey };

  if (status) {
    criteria.status = status;
  }

  if (q) {
    // indexed.title varsa onu kullan, yoksa tüm string/text field'larında ara
    const stringFields = (collectionType.fields || [])
      .filter(f => ['string', 'text'].includes(f.type))
      .map(f => f.key);
    
    if (stringFields.length > 0) {
      const searchConditions = [
        { 'indexed.title': { $regex: q, $options: 'i' } }
      ];
      
      // Her string field için de arama yap
      stringFields.forEach(fieldKey => {
        searchConditions.push({ [`data.${fieldKey}`]: { $regex: q, $options: 'i' } });
      });
      
      criteria.$or = searchConditions;
    } else {
      // String field yoksa sadece indexed.title'da ara
      criteria['indexed.title'] = { $regex: q, $options: 'i' };
    }
  }

  if (filter && typeof filter === 'object') {
    for (const [fieldKey, value] of Object.entries(filter)) {
      if (value === undefined || value === null || value === '') continue;
      criteria[`data.${fieldKey}`] = value;
    }
  }

  const total = await CollectionEntry.countDocuments(criteria);
  const items = await CollectionEntry.find(criteria)
    .sort(resolveSort(sort, collectionType))
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

async function createEntry({ tenantId, collectionKey, payload, userId }) {
  const collectionType = await getCollectionType({ tenantId, key: collectionKey });

  const { data, errors } = await normaliseAndValidateData({ collectionType, data: payload.data });
  if (errors.length) {
    const error = new Error('Entry validation failed');
    error.code = 'EntryValidationFailed';
    error.details = errors;
    throw error;
  }

  await ensureUniqueFields({ tenantId, collectionKey, fields: collectionType.fields || [], data });

  const relations = normaliseRelations(payload.relations || {});
  const slug = await resolveSlug({ collectionType, tenantId, collectionKey, payload, data });
  const status = payload.status || 'draft';

  const doc = await CollectionEntry.create({
    tenantId,
    collectionKey,
    slug,
    data,
    relations,
    indexed: buildIndexedSnapshot(collectionType, data),
    status,
    createdBy: toObjectId(userId),
    updatedBy: toObjectId(userId)
  });

  return doc.toObject();
}

async function getEntry({ tenantId, collectionKey, entryId }) {
  if (!ObjectId.isValid(entryId)) {
    const error = new Error('Invalid entry id');
    error.code = 'InvalidEntryId';
    throw error;
  }
  const doc = await CollectionEntry.findOne({ tenantId, collectionKey, _id: entryId });
  if (!doc) {
    const error = new Error('Entry not found');
    error.code = 'EntryNotFound';
    throw error;
  }
  return doc;
}

async function updateEntry({ tenantId, collectionKey, entryId, payload, userId }) {
  const collectionType = await getCollectionType({ tenantId, key: collectionKey });
  const existing = await getEntry({ tenantId, collectionKey, entryId });

  const mergedData = {
    ...(existing.data || {}),
    ...(payload.data || {})
  };

  const { data, errors } = await normaliseAndValidateData({ collectionType, data: mergedData });
  if (errors.length) {
    const error = new Error('Entry validation failed');
    error.code = 'EntryValidationFailed';
    error.details = errors;
    throw error;
  }

  await ensureUniqueFields({ tenantId, collectionKey, fields: collectionType.fields || [], data, excludeId: existing._id });

  const relations = normaliseRelations(mergeRelations(existing.relations || {}, payload.relations || {}));
  const status = payload.status || existing.status;

  const slug = await resolveSlug({
    collectionType,
    tenantId,
    collectionKey,
    payload,
    data,
    excludeId: existing._id
  });

  if (slug !== undefined) {
    existing.slug = slug;
  }
  existing.data = data;
  existing.relations = relations;
  existing.indexed = buildIndexedSnapshot(collectionType, data);
  existing.status = status;
  existing.updatedBy = toObjectId(userId) || existing.updatedBy;

  await existing.save();
  return existing.toObject();
}

async function deleteEntry({ tenantId, collectionKey, entryId }) {
  if (!ObjectId.isValid(entryId)) {
    const error = new Error('Invalid entry id');
    error.code = 'InvalidEntryId';
    throw error;
  }

  const result = await CollectionEntry.deleteOne({ tenantId, collectionKey, _id: entryId });
  if (!result.deletedCount) {
    const error = new Error('Entry not found');
    error.code = 'EntryNotFound';
    throw error;
  }
}

async function findEntryBySlug({ tenantId, collectionKey, slug, status = 'published' }) {
  if (!slug) return null;
  const query = { tenantId, collectionKey, slug };
  if (status) {
    query.status = status;
  }

  const doc = await CollectionEntry.findOne(query).lean();
  return doc;
}

function serializeEntry(doc) {
  if (!doc) return null;
  return {
    id: doc._id?.toString?.() || doc._id,
    collectionKey: doc.collectionKey,
    slug: doc.slug,
    status: doc.status,
    data: doc.data,
    relations: doc.relations,
    indexed: doc.indexed,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normaliseComparisonValue(field, operator, rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return rawValue;
  }

  if (Array.isArray(rawValue) && !['IN', 'NIN'].includes(operator)) {
    return rawValue[0];
  }

  switch (field?.type) {
    case 'number':
      if (Array.isArray(rawValue)) {
        const mapped = rawValue
          .map((item) => Number(item))
          .filter((item) => Number.isFinite(item));
        if (!mapped.length) {
          throw new Error(`${field.key} için geçerli sayı değeri gerekli`);
        }
        return mapped;
      }
      if (!Number.isFinite(Number(rawValue))) {
        throw new Error(`${field?.key || 'alan'} için geçerli sayı değeri gerekli`);
      }
      return Number(rawValue);
    case 'boolean':
      if (Array.isArray(rawValue)) {
        return rawValue.map((item) => item === true || item === 'true');
      }
      return rawValue === true || rawValue === 'true';
    case 'date':
    case 'datetime':
      if (Array.isArray(rawValue)) {
        const mapped = rawValue
          .map((item) => new Date(item))
          .filter((item) => !Number.isNaN(item.getTime()));
        if (!mapped.length) {
          throw new Error(`${field?.key || 'alan'} için geçerli tarih değeri gerekli`);
        }
        return mapped;
      }
      {
        const date = new Date(rawValue);
        if (Number.isNaN(date.getTime())) {
          throw new Error(`${field?.key || 'alan'} için geçerli tarih değeri gerekli`);
        }
        return date;
      }
    case 'ref':
    case 'media':
      if (Array.isArray(rawValue)) {
        return rawValue.map((item) => mongoose.Types.ObjectId.isValid(item) ? new mongoose.Types.ObjectId(item) : item);
      }
      return mongoose.Types.ObjectId.isValid(rawValue) ? new mongoose.Types.ObjectId(rawValue) : rawValue;
    default:
      return rawValue;
  }
}

function buildMongoCondition(fieldMeta, operator, rawValue) {
  const value = normaliseComparisonValue(fieldMeta, operator, rawValue);

  switch (operator) {
    case '=':
      return value;
    case '!=':
      return { $ne: value };
    case 'IN':
      return { $in: Array.isArray(value) ? value : [value] };
    case 'NIN':
      return { $nin: Array.isArray(value) ? value : [value] };
    case '>':
      return { $gt: value };
    case '>=':
      return { $gte: value };
    case '<':
      return { $lt: value };
    case '<=':
      return { $lte: value };
    case 'LIKE': {
      if (typeof rawValue !== 'string') {
        throw new Error('LIKE operatörü için metin değeri gerekli');
      }
      return { $regex: new RegExp(escapeRegExp(rawValue), 'i') };
    }
    default:
      throw new Error(`Desteklenmeyen operatör: ${operator}`);
  }
}

function resolveSortFromOrder(collectionType, orderBy = []) {
  if (!Array.isArray(orderBy) || !orderBy.length) {
    return { createdAt: -1 };
  }

  const sort = {};
  orderBy.forEach(([field, direction]) => {
    const key = resolveSortKey(field, collectionType);
    sort[key] = direction === 'asc' ? 1 : -1;
  });
  return Object.keys(sort).length ? sort : { createdAt: -1 };
}

function ensureArrayValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [value].filter(Boolean);
}

function resolveEntryValue(entryDoc, segments = []) {
  if (!entryDoc) return null;
  if (!segments.length) {
    return serializeEntry(entryDoc);
  }

  const [current, ...rest] = segments;
  switch (current) {
    case 'id':
      return entryDoc._id?.toString?.() || entryDoc._id;
    case '_id':
      return entryDoc._id;
    case 'slug':
      return rest.length ? resolveEntryValue({ slug: entryDoc.slug }, rest) : entryDoc.slug;
    case 'status':
      return rest.length ? resolveEntryValue({ status: entryDoc.status }, rest) : entryDoc.status;
    case 'indexed':
      return rest.length ? resolveEntryValue({ indexed: entryDoc.indexed }, rest) : entryDoc.indexed;
    case 'data':
      if (!rest.length) return entryDoc.data;
      return rest.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), entryDoc.data);
    case 'title':
      if (!rest.length) {
        return entryDoc.indexed?.title || entryDoc.data?.title;
      }
      break;
    case 'date':
      if (!rest.length) {
        return entryDoc.indexed?.date || entryDoc.data?.date;
      }
      break;
    default:
      if (rest.length === 0) {
        if (entryDoc.data && entryDoc.data[current] !== undefined) {
          return entryDoc.data[current];
        }
        if (entryDoc.indexed && entryDoc.indexed[current] !== undefined) {
          return entryDoc.indexed[current];
        }
      }
      const nextSource = entryDoc.data?.[current] ?? entryDoc.indexed?.[current];
      if (nextSource && typeof nextSource === 'object') {
        return rest.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), nextSource);
      }
  }

  return undefined;
}

function resolveMediaValue(mediaDoc, segments = []) {
  if (!mediaDoc) return null;
  if (!segments.length) return mediaDoc;
  return segments.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), mediaDoc);
}

async function runCollectionQuery({ tenantId, payload }) {
  const collectionTypeDoc = await getCollectionType({ tenantId, key: payload.collection });
  const collectionType = collectionTypeDoc.toObject ? collectionTypeDoc.toObject() : collectionTypeDoc;

  const fieldMap = new Map((collectionType.fields || []).map((field) => [field.key, field]));

  const baseQuery = {
    tenantId,
    collectionKey: payload.collection
  };

  const whereClauses = [];

  if (Array.isArray(payload.where)) {
    payload.where.forEach(([fieldRef, operator, rawValue]) => {
      const trimmedField = String(fieldRef || '').trim();
      if (!trimmedField) {
        throw new Error('Where koşulundaki alan boş olamaz');
      }

      let mongoPath;
      let fieldMeta = null;

      if (['id', '_id'].includes(trimmedField)) {
        mongoPath = '_id';
      } else if (['slug', 'status', 'createdAt', 'updatedAt'].includes(trimmedField)) {
        mongoPath = trimmedField;
      } else if (trimmedField.startsWith('indexed.')) {
        mongoPath = trimmedField;
      } else if (fieldMap.has(trimmedField)) {
        fieldMeta = fieldMap.get(trimmedField);
        mongoPath = `data.${fieldMeta.key}`;
      } else {
        throw new Error(`'${trimmedField}' alanı filtre için izinli değil`);
      }

      const condition = buildMongoCondition(fieldMeta, operator, rawValue);

      if (mongoPath === '_id' && typeof condition === 'string' && mongoose.Types.ObjectId.isValid(condition)) {
        whereClauses.push({ [mongoPath]: new mongoose.Types.ObjectId(condition) });
      } else {
        whereClauses.push({ [mongoPath]: condition });
      }
    });
  }

  if (whereClauses.length) {
    baseQuery.$and = whereClauses;
  }

  const limit = payload.limit || 50;
  const offset = typeof payload.offset === 'number'
    ? payload.offset
    : ((payload.page || 1) - 1) * limit;

  const sort = resolveSortFromOrder(collectionType, payload.orderBy);

  const [items, total] = await Promise.all([
    CollectionEntry.find(baseQuery)
      .sort(sort)
      .skip(offset)
      .limit(limit)
      .lean(),
    CollectionEntry.countDocuments(baseQuery)
  ]);

  const selectList = Array.isArray(payload.select) && payload.select.length ? payload.select : null;

  if (!selectList) {
    return {
      items: items.map(serializeEntry),
      pagination: {
        total,
        limit,
        offset,
        page: payload.page || Math.floor(offset / limit) + 1,
        pages: Math.ceil(total / limit)
      }
    };
  }

  const descriptorList = selectList.map((raw) => {
    const path = String(raw).trim();
    if (!path) {
      throw new Error('Seçim alanı boş olamaz');
    }

    const segments = path.split('.');
    const head = segments[0];

    if (['id', '_id', 'slug', 'status', 'createdAt', 'updatedAt'].includes(head)) {
      return { type: 'builtin', key: path, segments };
    }

    if (head === 'indexed') {
      return { type: 'indexed', key: path, segments: segments.slice(1) };
    }

    if (head === 'relations') {
      const relationKey = segments[1];
      if (!['media', 'contents', 'refs'].includes(relationKey)) {
        throw new Error(`'${relationKey}' ilişkisi desteklenmiyor`);
      }
      return {
        type: 'relation',
        relationKey,
        key: path,
        segments: segments.slice(2)
      };
    }

    if (fieldMap.has(head)) {
      return {
        type: 'field',
        field: fieldMap.get(head),
        key: path,
        segments: segments.slice(1)
      };
    }

    throw new Error(`'${path}' alanı select içinde kullanılamaz`);
  });

  const requiredRefFields = descriptorList.filter((descriptor) => descriptor.type === 'field' && descriptor.field.type === 'ref' && descriptor.segments.length);
  const requiredMediaFields = descriptorList.filter((descriptor) => descriptor.type === 'field' && descriptor.field.type === 'media' && descriptor.segments.length);
  const relationMediaRequested = descriptorList.some((descriptor) => descriptor.type === 'relation' && descriptor.relationKey === 'media' && descriptor.segments.length);
  const relationContentsRequested = descriptorList.some((descriptor) => descriptor.type === 'relation' && descriptor.relationKey === 'contents' && descriptor.segments.length);

  const refIdSet = new Set();
  const mediaIdSet = new Set();
  const contentIdSet = new Set();

  if (requiredRefFields.length || relationMediaRequested || relationContentsRequested || requiredMediaFields.length) {
    items.forEach((item) => {
      requiredRefFields.forEach((descriptor) => {
        const rawValue = item.data?.[descriptor.field.key];
        ensureArrayValue(rawValue).forEach((id) => {
          if (mongoose.Types.ObjectId.isValid(id)) {
            refIdSet.add(id.toString());
          }
        });
      });

      requiredMediaFields.forEach((descriptor) => {
        const rawValue = item.data?.[descriptor.field.key];
        ensureArrayValue(rawValue).forEach((id) => {
          if (mongoose.Types.ObjectId.isValid(id)) {
            mediaIdSet.add(id.toString());
          }
        });
      });

      if (relationMediaRequested && Array.isArray(item.relations?.media)) {
        item.relations.media.forEach((id) => {
          if (mongoose.Types.ObjectId.isValid(id)) {
            mediaIdSet.add(id.toString());
          }
        });
      }

      if (relationContentsRequested && Array.isArray(item.relations?.contents)) {
        item.relations.contents.forEach((id) => {
          if (mongoose.Types.ObjectId.isValid(id)) {
            contentIdSet.add(id.toString());
          }
        });
      }
    });
  }

  const [refDocs, mediaDocs, contentDocs] = await Promise.all([
    refIdSet.size ? CollectionEntry.find({ _id: { $in: Array.from(refIdSet) } }).lean() : [],
    mediaIdSet.size ? Media.find({ _id: { $in: Array.from(mediaIdSet) } }).lean() : [],
    contentIdSet.size ? Content.find({ _id: { $in: Array.from(contentIdSet) } }).lean() : []
  ]);

  const refCache = new Map(refDocs.map((doc) => [doc._id.toString(), doc]));
  const mediaCache = new Map(mediaDocs.map((doc) => [doc._id.toString(), doc]));
  const contentCache = new Map(contentDocs.map((doc) => [doc._id.toString(), doc]));

  const results = items.map((item) => {
    const row = {};
    descriptorList.forEach((descriptor) => {
      switch (descriptor.type) {
        case 'builtin': {
          if (descriptor.segments[0] === 'id' || descriptor.segments[0] === '_id') {
            row[descriptor.key] = item._id?.toString?.() || item._id;
          } else {
            row[descriptor.key] = item[descriptor.segments[0]];
          }
          break;
        }
        case 'indexed': {
          row[descriptor.key] = descriptor.segments.reduce((acc, segment) => (acc && acc[segment] !== undefined ? acc[segment] : undefined), item.indexed);
          break;
        }
        case 'field': {
          const fieldValue = item.data?.[descriptor.field.key];
          if (descriptor.field.type === 'ref' && descriptor.segments.length) {
            const values = ensureArrayValue(fieldValue).map((id) => {
              const refDoc = refCache.get(id?.toString?.() || id);
              return resolveEntryValue(refDoc, descriptor.segments);
            }).filter((entry) => entry !== undefined);
            row[descriptor.key] = descriptor.field.settings?.multiple ? values : values[0] ?? null;
          } else if (descriptor.field.type === 'media' && descriptor.segments.length) {
            const values = ensureArrayValue(fieldValue).map((id) => {
              const mediaDoc = mediaCache.get(id?.toString?.() || id);
              return resolveMediaValue(mediaDoc, descriptor.segments);
            }).filter((entry) => entry !== undefined);
            row[descriptor.key] = descriptor.field.settings?.multiple ? values : values[0] ?? null;
          } else if (!descriptor.segments.length) {
            row[descriptor.key] = fieldValue;
          } else {
            const nested = descriptor.segments.reduce((acc, segment) => (acc && acc[segment] !== undefined ? acc[segment] : undefined), fieldValue);
            row[descriptor.key] = nested;
          }
          break;
        }
        case 'relation': {
          const values = item.relations?.[descriptor.relationKey];
          if (!descriptor.segments.length) {
            row[descriptor.key] = values;
            break;
          }
          if (descriptor.relationKey === 'media') {
            const resolved = ensureArrayValue(values).map((id) => resolveMediaValue(mediaCache.get(id?.toString?.() || id), descriptor.segments)).filter((entry) => entry !== undefined);
            row[descriptor.key] = resolved;
          } else if (descriptor.relationKey === 'contents') {
            const resolved = ensureArrayValue(values).map((id) => {
              const contentDoc = contentCache.get(id?.toString?.() || id);
              if (!contentDoc) return null;
              return descriptor.segments.reduce((acc, segment) => (acc && acc[segment] !== undefined ? acc[segment] : undefined), contentDoc);
            }).filter((entry) => entry !== undefined && entry !== null);
            row[descriptor.key] = resolved;
          } else {
            row[descriptor.key] = values;
          }
          break;
        }
        default:
          row[descriptor.key] = undefined;
      }
    });
    return row;
  });

  return {
    items: results,
    pagination: {
      total,
      limit,
      offset,
      page: payload.page || Math.floor(offset / limit) + 1,
      pages: Math.ceil(total / limit)
    }
  };
}

module.exports = {
  listEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  getEntry,
  findEntryBySlug,
  runCollectionQuery
};
