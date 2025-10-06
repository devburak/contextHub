const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const FIELD_TYPES = [
  'string',
  'text',
  'number',
  'boolean',
  'date',
  'datetime',
  'enum',
  'ref',
  'media',
  'geojson'
];

const optionsSchema = new Schema(
  {
    value: { type: String, required: true },
    label: { type: Map, of: String }
  },
  { _id: false }
);

const fieldSchema = new Schema(
  {
    key: { type: String, required: true },
    type: { type: String, enum: FIELD_TYPES, required: true },
    label: { type: Map, of: String },
    description: { type: Map, of: String },
    options: [optionsSchema],
    ref: { type: String },
    required: { type: Boolean, default: false },
    unique: { type: Boolean, default: false },
    indexed: { type: Boolean, default: false },
    defaultValue: Schema.Types.Mixed,
    settings: Schema.Types.Mixed
  },
  { _id: false }
);

const collectionSettingsSchema = new Schema(
  {
    slugField: { type: String },
    defaultSort: {
      key: { type: String },
      dir: { type: String, enum: ['asc', 'desc'] }
    },
    enableVersioning: { type: Boolean, default: false },
    allowDrafts: { type: Boolean, default: true },
    previewUrlTemplate: { type: String }
  },
  { _id: false }
);

const collectionTypeSchema = new Schema(
  {
    tenantId: { type: ObjectId, ref: 'Tenant', required: true, index: true },
    key: { type: String, required: true },
    name: { type: Map, of: String, required: true },
    description: { type: Map, of: String },
    fields: { type: [fieldSchema], default: [] },
    settings: collectionSettingsSchema,
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    createdBy: { type: ObjectId, ref: 'User' },
    updatedBy: { type: ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

collectionTypeSchema.index({ tenantId: 1, key: 1 }, { unique: true });
collectionTypeSchema.index({ tenantId: 1, status: 1 });

const CollectionType = mongoose.model('CollectionType', collectionTypeSchema);

CollectionType.fieldSchema = fieldSchema;
CollectionType.collectionSettingsSchema = collectionSettingsSchema;
CollectionType.FIELD_TYPES = FIELD_TYPES;

module.exports = CollectionType;
