/**
 * Migrate legacy CollectionDef/CollectionItem documents into the new
 * CollectionType/CollectionEntry structure.
 *
 * Run with:
 *   node scripts/migrate-collection-types.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const mongoose = require('mongoose');
const { CollectionType, CollectionEntry } = require('@contexthub/common');

async function migrateCollections() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('Error: MONGODB_URI or MONGO_URI not configured');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✓ Connected');

    const legacyDefs = await mongoose.connection
      .collection('collectiondefs')
      .find({})
      .toArray();

    if (!legacyDefs.length) {
      console.log('No legacy collections found. Nothing to migrate.');
      return;
    }

    console.log(`Found ${legacyDefs.length} legacy collection definitions`);

    for (const legacyDef of legacyDefs) {
      const collectionKey = legacyDef.apiName;

      const existingType = await CollectionType.findOne({
        tenantId: legacyDef.tenantId,
        key: collectionKey
      });

      if (existingType) {
        console.log(`• Skipping ${collectionKey} (already migrated)`);
        continue;
      }

      const localizedName = legacyDef.schemaJson?.name || legacyDef.name;
      const typeDoc = new CollectionType({
        tenantId: legacyDef.tenantId,
        key: collectionKey,
        name: normalizeLocalizedField(localizedName, legacyDef.locale),
        description: normalizeLocalizedField(legacyDef.schemaJson?.description),
        fields: extractFields(legacyDef.schemaJson),
        settings: extractSettings(legacyDef.schemaJson),
        status: legacyDef.schemaJson?.status === 'archived' ? 'archived' : 'active',
        createdBy: legacyDef.createdBy,
        updatedBy: legacyDef.updatedBy,
        createdAt: legacyDef.createdAt,
        updatedAt: legacyDef.updatedAt
      });

      await typeDoc.save();
      console.log(`✓ Migrated CollectionType ${collectionKey}`);

      const legacyItems = await mongoose.connection
        .collection('collectionitems')
        .find({ collectionId: legacyDef._id })
        .toArray();

      if (!legacyItems.length) {
        continue;
      }

      console.log(`  ↳ Migrating ${legacyItems.length} entries`);

      for (const legacyItem of legacyItems) {
        const slug = legacyItem.meta?.slug || legacyItem.data?.slug || undefined;
        const entryDoc = new CollectionEntry({
          tenantId: legacyItem.tenantId,
          collectionKey,
          slug,
          data: legacyItem.data || {},
          indexed: {
            title: legacyItem.data?.title || legacyItem.meta?.title,
            date: legacyItem.meta?.date || legacyItem.data?.date,
            tags: legacyItem.meta?.tags,
            geo: legacyItem.meta?.geo
          },
          status: legacyItem.status || 'draft',
          createdBy: legacyItem.createdBy,
          updatedBy: legacyItem.updatedBy,
          createdAt: legacyItem.createdAt,
          updatedAt: legacyItem.updatedAt
        });

        try {
          await entryDoc.save();
        } catch (error) {
          console.warn(`    ! Failed to migrate entry ${legacyItem._id}: ${error.message}`);
        }
      }
    }

    console.log('Migration completed.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

function normalizeLocalizedField(value, fallbackLocale) {
  if (!value) {
    return undefined;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  const locale = fallbackLocale || 'default';
  return { [locale]: value };
}

function extractFields(schemaJson) {
  if (!schemaJson?.fields || !Array.isArray(schemaJson.fields)) {
    return [];
  }

  return schemaJson.fields.map((field) => ({
    key: field.key || field.name,
    type: field.type || 'string',
    label: normalizeLocalizedField(field.label) || normalizeLocalizedField(field.title),
    description: normalizeLocalizedField(field.description),
    options: field.options,
    ref: field.ref,
    required: Boolean(field.required),
    unique: Boolean(field.unique),
    indexed: Boolean(field.indexed),
    defaultValue: field.defaultValue,
    settings: field.settings
  }));
}

function extractSettings(schemaJson) {
  if (!schemaJson?.settings) {
    return undefined;
  }

  const { slugField, defaultSort, enableVersioning, allowDrafts, previewUrlTemplate } = schemaJson.settings;
  return {
    slugField,
    defaultSort,
    enableVersioning,
    allowDrafts,
    previewUrlTemplate
  };
}

migrateCollections();
