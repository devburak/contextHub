const { Media, Tenant } = require('@contexthub/common')
const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const sharp = require('sharp')
const crypto = require('crypto')
const path = require('path')
const mongoose = require('mongoose')

const MAX_UPLOAD_BYTES = Number(process.env.R2_UPLOAD_MAX_MB || 100) * 1024 * 1024
const PUBLIC_DOMAIN = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '')
const BUCKET = process.env.R2_BUCKET
const RAW_ENDPOINT = process.env.R2_S3_ENDPOINT
const ACCESS_KEY = process.env.R2_ACCESS_KEY
const SECRET_KEY = process.env.R2_SECRET_KEY

if (!BUCKET) {
  throw new Error('R2_BUCKET env variable is required for media uploads.')
}

if (!PUBLIC_DOMAIN) {
  throw new Error('R2_PUBLIC_DOMAIN env variable is required for media uploads.')
}

if (!RAW_ENDPOINT) {
  throw new Error('R2_S3_ENDPOINT env variable is required for media uploads.')
}

if (!ACCESS_KEY || !SECRET_KEY) {
  throw new Error('R2_ACCESS_KEY and R2_SECRET_KEY env variables are required for media uploads.')
}

const NORMALISED_ENDPOINT = (() => {
  const trimmed = RAW_ENDPOINT.replace(/\/+$/, '')
  if (!BUCKET) return trimmed
  const bucketSuffix = `/${BUCKET}`
  return trimmed.endsWith(bucketSuffix) ? trimmed.slice(0, -bucketSuffix.length) : trimmed
})()

const s3Client = new S3Client({
  region: 'auto',
  endpoint: NORMALISED_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
})

const ObjectId = mongoose.Types.ObjectId

const DEFAULT_VARIANTS = [
  { name: 'thumbnail', width: 150, height: 150, fit: 'cover' },
  { name: 'medium', width: 300, height: 300, fit: 'inside' },
  { name: 'large', width: 768, height: 768, fit: 'inside' },
]

const variantConfig = parseVariantConfig(process.env.R2_IMAGE_VARIANTS) || DEFAULT_VARIANTS

function parseVariantConfig(input) {
  if (!input) return null
  const variants = input.split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [namePart, sizePart] = segment.split(':')
      if (!namePart || !sizePart) return null
      const name = namePart.trim()
      const [widthRaw, heightRaw] = sizePart.split('x')
      const width = Number(widthRaw)
      const height = Number(heightRaw)
      if (!name || Number.isNaN(width) || Number.isNaN(height)) return null
      return { name, width, height, fit: 'inside' }
    })
    .filter(Boolean)

  return variants.length ? variants : null
}

function slugifyFileName(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-_\.]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function createUniqueFileName(originalName) {
  const parsed = path.parse(originalName || 'file')
  const base = slugifyFileName(parsed.name || 'file') || 'file'
  const ext = parsed.ext ? parsed.ext.replace('.', '').toLowerCase() : ''
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  const randomSuffix = crypto.randomBytes(4).toString('hex')
  const fileName = `${base}-${timestamp}-${randomSuffix}${ext ? `.${ext}` : ''}`
  return { fileName, ext }
}

function buildFolderParts(date = new Date()) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return { folder: `${year}/${month}`, year, month }
}

function buildPublicUrl(key) {
  if (!PUBLIC_DOMAIN) return null
  return `${PUBLIC_DOMAIN}/${key}`
}

function ensureKeyMatchesTenant(key, tenantSlug) {
  if (!key.startsWith(`${tenantSlug}/`)) {
    throw new Error('Provided key does not match tenant slug')
  }
}

function toObjectIdList(ids = []) {
  if (!Array.isArray(ids)) return []
  return ids
    .map((id) => (ObjectId.isValid(id) ? new ObjectId(id) : null))
    .filter(Boolean)
}

function toObjectId(id) {
  if (!id || !ObjectId.isValid(id)) return null
  return new ObjectId(id)
}

async function deleteObjectsFromStorage(keys = []) {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)))
  for (const key of uniqueKeys) {
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
    } catch (error) {
      if (error?.$metadata?.httpStatusCode === 404) {
        continue
      }
      throw error
    }
  }
}

async function generatePresignedUpload({ tenantId, requestedName, contentType, size }) {
  if (!contentType) {
    throw new Error('contentType is required')
  }

  if (size && size > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds upload limit of ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`)
  }

  const tenant = await Tenant.findById(tenantId)
  if (!tenant) {
    throw new Error('Tenant not found')
  }

  const { fileName, ext } = createUniqueFileName(requestedName)
  const { folder } = buildFolderParts()
  const key = `${tenant.slug}/${folder}/${fileName}`
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 * 5 })

  return {
    uploadUrl,
    key,
    fileName,
    folder,
    bucket: BUCKET,
    publicUrl: buildPublicUrl(key),
    extension: ext,
    maxUploadBytes: MAX_UPLOAD_BYTES,
  }
}

async function streamToBuffer(stream) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function uploadVariantBuffer({ key, buffer, contentType }) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  })
  await s3Client.send(command)
}

function normaliseTags(tagsInput) {
  if (!Array.isArray(tagsInput)) return []
  const unique = new Set()
  tagsInput.forEach((tag) => {
    if (typeof tag !== 'string') return
    const trimmed = tag.trim()
    if (!trimmed) return
    unique.add(trimmed.toLowerCase())
  })
  return Array.from(unique)
}

async function completeUpload({
  tenantId,
  userId,
  key,
  originalName,
  providedMimeType,
  providedSize,
  altText,
  caption,
  description,
  tags,
}) {
  if (!key) {
    throw new Error('key is required')
  }

  if (!userId) {
    throw new Error('Authenticated user is required to record media uploads')
  }

  const tenant = await Tenant.findById(tenantId)
  if (!tenant) {
    throw new Error('Tenant not found')
  }

  ensureKeyMatchesTenant(key, tenant.slug)
  const segments = key.split('/')
  const fileName = segments.slice(-1)[0]

  if (!fileName) {
    throw new Error('Invalid storage key provided')
  }
  const yearSegment = segments[1]
  const monthSegment = segments[2]

  if (!yearSegment || !monthSegment) {
    throw new Error('Storage key must follow pattern tenantSlug/year/month/fileName')
  }

  const folder = `${yearSegment}/${monthSegment}`

  const headCommand = new HeadObjectCommand({ Bucket: BUCKET, Key: key })
  const head = await s3Client.send(headCommand)

  const contentLength = Number(head.ContentLength || providedSize || 0)
  if (contentLength > MAX_UPLOAD_BYTES) {
    throw new Error(`Uploaded file exceeds upload limit of ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`)
  }

  const mimeType = head.ContentType || providedMimeType || 'application/octet-stream'

  const getObjectCommand = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  const object = await s3Client.send(getObjectCommand)
  const buffer = await streamToBuffer(object.Body)

  const checksum = crypto.createHash('md5').update(buffer).digest('hex')

  let width = null
  let height = null
  const variants = []

  if (mimeType.startsWith('image/')) {
    try {
      const baseImage = sharp(buffer)
      const metadata = await baseImage.metadata()
      width = metadata.width || null
      height = metadata.height || null

      for (const variant of variantConfig) {
        const baseName = path.parse(fileName).name
        const variantKey = `${tenant.slug}/${folder}/${baseName}__${variant.name}.webp`
        const resized = await sharp(buffer)
          .resize({
            width: variant.width,
            height: variant.height,
            fit: variant.fit || 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality: 80 })
          .toBuffer()

        await uploadVariantBuffer({
          key: variantKey,
          buffer: resized,
          contentType: 'image/webp',
        })

        const variantMeta = await sharp(resized).metadata()

        variants.push({
          name: variant.name,
          key: variantKey,
          url: buildPublicUrl(variantKey),
          width: variantMeta.width || null,
          height: variantMeta.height || null,
          size: resized.length,
          mimeType: 'image/webp',
          format: 'webp',
          checksum: crypto.createHash('md5').update(resized).digest('hex'),
          transforms: [`resize:${variant.width}x${variant.height}`, 'format:webp'],
        })
      }
    } catch (error) {
      throw new Error(`Image processing failed: ${error.message}`)
    }
  }

  const document = await Media.create({
    tenantId,
    tenantSlug: tenant.slug,
    key,
    bucket: BUCKET,
    url: buildPublicUrl(key),
    folder,
    fileName,
    originalName: originalName || fileName,
    extension: path.extname(fileName).replace('.', '').toLowerCase() || null,
    mimeType,
    size: contentLength,
    width,
    height,
    checksum,
    etag: head.ETag ? head.ETag.replace(/"/g, '') : null,
    variants,
    altText: altText || '',
    caption: caption || '',
    description: description || '',
    tags: normaliseTags(tags),
    metadata: {
      storageClass: head.StorageClass || 'STANDARD',
      lastModified: head.LastModified,
      source: 'direct-upload',
    },
    createdBy: userId,
    updatedBy: userId,
  })

  return document.toObject()
}

async function listMedia({ tenantId, filters = {}, pagination = {} }) {
  const {
    search,
    mimeType,
    tags = [],
    status = 'active',
  } = filters

  const page = Math.max(Number(pagination.page || 1), 1)
  const limit = Math.min(Math.max(Number(pagination.limit || 20), 1), 100)
  const skip = (page - 1) * limit

  const query = { tenantId }
  if (status) {
    query.status = status
  }
  if (mimeType) {
    query.mimeType = new RegExp(`^${mimeType}`)
  }
  if (Array.isArray(tags) && tags.length) {
    query.tags = { $all: tags.map((tag) => tag.toLowerCase()) }
  }
  if (search) {
    const regex = new RegExp(search.split(' ').map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i')
    query.$or = [
      { originalName: regex },
      { fileName: regex },
      { description: regex },
      { caption: regex },
    ]
  }

  const [items, total] = await Promise.all([
    Media.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Media.countDocuments(query),
  ])

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 1,
    },
  }
}

function sanitiseTextInput(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

async function updateMediaMetadata({ tenantId, mediaId, payload = {}, userId }) {
  if (!ObjectId.isValid(mediaId)) {
    throw new Error('Invalid media identifier')
  }

  const updateSet = {}

  if (Object.prototype.hasOwnProperty.call(payload, 'originalName')) {
    updateSet.originalName = sanitiseTextInput(payload.originalName)
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'altText')) {
    updateSet.altText = sanitiseTextInput(payload.altText)
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'caption')) {
    updateSet.caption = sanitiseTextInput(payload.caption)
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'description')) {
    updateSet.description = sanitiseTextInput(payload.description)
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'tags')) {
    if (Array.isArray(payload.tags)) {
      updateSet.tags = normaliseTags(payload.tags)
    } else if (typeof payload.tags === 'string') {
      updateSet.tags = normaliseTags(payload.tags.split(','))
    } else {
      updateSet.tags = []
    }
  }

  if (!Object.keys(updateSet).length) {
    throw new Error('No metadata fields provided for update')
  }

  const updaterId = toObjectId(userId)
  if (updaterId) {
    updateSet.updatedBy = updaterId
  }

  const updated = await Media.findOneAndUpdate(
    { _id: new ObjectId(mediaId), tenantId },
    { $set: updateSet },
    { new: true }
  )

  if (!updated) {
    throw new Error('Media not found')
  }

  return updated.toObject()
}

async function deleteMedia({ tenantId, mediaId }) {
  if (!ObjectId.isValid(mediaId)) {
    throw new Error('Invalid media identifier')
  }

  const media = await Media.findOne({ _id: new ObjectId(mediaId), tenantId })
  if (!media) {
    return { deleted: 0 }
  }

  const keysToRemove = [media.key, ...(media.variants || []).map((variant) => variant.key)]
  await deleteObjectsFromStorage(keysToRemove)
  await Media.deleteOne({ _id: media._id, tenantId })

  return { deleted: 1 }
}

async function bulkDeleteMedia({ tenantId, mediaIds = [] }) {
  const objectIds = toObjectIdList(mediaIds)
  if (!objectIds.length) {
    return { deleted: 0 }
  }

  const mediaList = await Media.find({ tenantId, _id: { $in: objectIds } })
  if (!mediaList.length) {
    return { deleted: 0 }
  }

  const keys = mediaList.flatMap((item) => [item.key, ...(item.variants || []).map((variant) => variant.key)])
  await deleteObjectsFromStorage(keys)
  const result = await Media.deleteMany({ tenantId, _id: { $in: objectIds } })

  return { deleted: result.deletedCount || mediaList.length }
}

async function bulkTagMedia({ tenantId, mediaIds = [], tags = [], mode = 'add', userId }) {
  const objectIds = toObjectIdList(mediaIds)
  if (!objectIds.length) {
    return { modified: 0 }
  }

  const normalisedTags = normaliseTags(tags)
  if (!normalisedTags.length) {
    return { modified: 0 }
  }

  const filter = { tenantId, _id: { $in: objectIds } }
  const update = { $set: { updatedAt: new Date() } }
  const updaterId = toObjectId(userId)
  if (updaterId) {
    update.$set.updatedBy = updaterId
  }

  if (mode === 'replace') {
    update.$set.tags = normalisedTags
  } else {
    update.$addToSet = { tags: { $each: normalisedTags } }
  }

  const result = await Media.updateMany(filter, update)
  return { modified: result.modifiedCount || 0 }
}

module.exports = {
  generatePresignedUpload,
  completeUpload,
  listMedia,
  updateMediaMetadata,
  deleteMedia,
  bulkDeleteMedia,
  bulkTagMedia,
}
