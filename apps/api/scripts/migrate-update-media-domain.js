/**
 * Replace legacy media CDN domain with the current R2 public domain.
 *
 * Usage:
 *   node scripts/migrate-update-media-domain.js
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') })
const mongoose = require('mongoose')
const { Media } = require('@contexthub/common')

const OLD_DOMAINS = [
  'https://contextstore.ikon-x.com.tr',
  'https://contextstore.ikon-x.com.tr/',
]

const NEW_DOMAIN = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '')

if (!NEW_DOMAIN) {
  console.error('Error: R2_PUBLIC_DOMAIN must be defined in the root .env file')
  process.exit(1)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const queryRegex = new RegExp(`^${escapeRegex(OLD_DOMAINS[0])}`, 'i')

function replaceDomain(value) {
  if (typeof value !== 'string' || !value) {
    return value
  }

  for (const candidate of OLD_DOMAINS) {
    const trimmed = candidate.replace(/\/$/, '')
    if (!trimmed) continue

    const pattern = new RegExp(`^${escapeRegex(trimmed)}(?=/|$)`, 'i')
    if (pattern.test(value)) {
      return value.replace(pattern, NEW_DOMAIN)
    }
  }

  return value
}

function replaceNested(value) {
  if (typeof value === 'string') {
    return replaceDomain(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceNested(item))
  }

  if (value && typeof value === 'object') {
    const next = Array.isArray(value) ? [] : { ...value }
    for (const key of Object.keys(next)) {
      next[key] = replaceNested(next[key])
    }
    return next
  }

  return value
}

async function migrate() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI
  if (!mongoUri) {
    console.error('Error: MONGODB_URI or MONGO_URI must be set in the root .env file')
    process.exit(1)
  }

  console.log('Connecting to MongoDB...')
  await mongoose.connect(mongoUri)
  console.log('✓ Connected to MongoDB\n')

  const filter = {
    sourceType: { $ne: 'external' },
    $or: [
      { url: { $regex: queryRegex } },
      { thumbnailUrl: { $regex: queryRegex } },
      { 'variants.url': { $regex: queryRegex } },
    ],
  }

  const cursor = Media.find(filter).cursor()

  let scanned = 0
  let updated = 0

  for await (const doc of cursor) {
    scanned += 1

    let hasChanges = false

    if (doc.url) {
      const nextUrl = replaceDomain(doc.url)
      if (nextUrl !== doc.url) {
        doc.url = nextUrl
        hasChanges = true
      }
    }

    if (doc.thumbnailUrl) {
      const nextThumb = replaceDomain(doc.thumbnailUrl)
      if (nextThumb !== doc.thumbnailUrl) {
        doc.thumbnailUrl = nextThumb
        hasChanges = true
      }
    }

    if (Array.isArray(doc.variants) && doc.variants.length) {
      let variantsChanged = false
      const nextVariants = doc.variants.map((variant) => {
        if (!variant) return variant
        const next = { ...variant }
        if (variant.url) {
          const nextVariantUrl = replaceDomain(variant.url)
          if (nextVariantUrl !== variant.url) {
            next.url = nextVariantUrl
            variantsChanged = true
          }
        }
        return next
      })
      if (variantsChanged) {
        doc.variants = nextVariants
        hasChanges = true
      }
    }

    if (doc.metadata && typeof doc.metadata === 'object') {
      const metadataObj = doc.metadata instanceof Map ? Object.fromEntries(doc.metadata) : { ...doc.metadata }
      const nextMetadata = replaceNested(metadataObj)
      const originalString = JSON.stringify(metadataObj)
      const nextString = JSON.stringify(nextMetadata)
      if (originalString !== nextString) {
        if (doc.metadata instanceof Map) {
          doc.metadata.clear()
          Object.entries(nextMetadata).forEach(([key, value]) => {
            doc.metadata.set(key, value)
          })
        } else {
          doc.metadata = nextMetadata
        }
        hasChanges = true
      }
    }

    if (hasChanges) {
      await doc.save({ validateBeforeSave: false })
      updated += 1
      console.log(`✓ Updated media ${doc._id.toString()}`)
    }
  }

  console.log('\nMigration complete.')
  console.log(`  Scanned: ${scanned}`)
  console.log(`  Updated: ${updated}`)

  await mongoose.disconnect()
  console.log('Disconnected from MongoDB')
}

migrate().catch((error) => {
  console.error('Migration failed:', error)
  mongoose.disconnect().finally(() => process.exit(1))
})
