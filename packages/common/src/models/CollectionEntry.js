const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const relationRefSchema = new Schema(
  {
    collectionKey: { type: String, required: true },
    entryId: { type: ObjectId, required: true, ref: 'CollectionEntry' },
    relationType: { type: String }
  },
  { _id: false }
);

const geoSchema = new Schema(
  {
    type: {
      type: String,
      enum: [
        'Point',
        'LineString',
        'Polygon',
        'MultiPoint',
        'MultiLineString',
        'MultiPolygon',
        'GeometryCollection'
      ]
    },
    coordinates: { type: [Number] }
  },
  { _id: false }
);

const indexedSnapshotSchema = new Schema(
  {
    title: { type: String },
    tags: { type: [String], default: undefined },
    date: { type: Date },
    geo: geoSchema
  },
  { _id: false }
);

const collectionEntrySchema = new Schema(
  {
    tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
    collectionKey: { type: String, required: true, index: true },
    slug: { type: String, index: true },
    data: { type: Schema.Types.Mixed, default: {} },
    relations: {
      contents: [{ type: ObjectId, ref: 'Content' }],
      media: [{ type: ObjectId, ref: 'Media' }],
      refs: [relationRefSchema]
    },
    indexed: indexedSnapshotSchema,
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    createdBy: { type: ObjectId, ref: 'User' },
    updatedBy: { type: ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

collectionEntrySchema.index({ tenantId: 1, collectionKey: 1, slug: 1 }, { unique: false });
collectionEntrySchema.index({ tenantId: 1, collectionKey: 1, status: 1 });
collectionEntrySchema.index({ tenantId: 1, collectionKey: 1, 'indexed.title': 1 });
collectionEntrySchema.index({ tenantId: 1, 'indexed.date': -1 });
collectionEntrySchema.index({ tenantId: 1, 'indexed.tags': 1 });
collectionEntrySchema.index({ 'indexed.geo': '2dsphere', tenantId: 1 });

const CollectionEntry = mongoose.model('CollectionEntry', collectionEntrySchema);

CollectionEntry.relationRefSchema = relationRefSchema;
CollectionEntry.indexedSnapshotSchema = indexedSnapshotSchema;

module.exports = CollectionEntry;
