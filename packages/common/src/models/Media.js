const mongoose = require('mongoose');
const { Schema } = mongoose;

const mediaVariantSchema = new Schema({
  name: { type: String, required: true },
  key: { type: String, required: true },
  url: { type: String, required: true },
  width: { type: Number },
  height: { type: Number },
  size: { type: Number },
  mimeType: { type: String },
  format: { type: String },
  checksum: { type: String },
  transforms: [{ type: String }]
}, { _id: false });

const mediaSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  tenantSlug: { type: String, required: true },
  sourceType: { type: String, enum: ['upload', 'external'], default: 'upload' },
  provider: { type: String },
  providerId: { type: String },
  externalUrl: { type: String },
  thumbnailUrl: { type: String },
  duration: { type: Number },
  key: {
    type: String,
    required: function requiredKey() {
      return this.sourceType !== 'external'
    },
  },
  bucket: {
    type: String,
    required: function requiredBucket() {
      return this.sourceType !== 'external'
    },
  },
  url: { type: String, required: true },
  folder: {
    type: String,
    required: function requiredFolder() {
      return this.sourceType !== 'external'
    },
  },
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
  extension: { type: String },
  mimeType: { type: String },
  size: { type: Number },
  width: { type: Number },
  height: { type: Number },
  checksum: { type: String },
  etag: { type: String },
  status: { type: String, enum: ['active', 'archived', 'deleted'], default: 'active' },
  isPublic: { type: Boolean, default: true },
  variants: [mediaVariantSchema],
  altText: { type: String },
  caption: { type: String },
  description: { type: String },
  tags: [{ type: String }],
  metadata: { type: Map, of: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
mediaSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
mediaSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Indexes
mediaSchema.index({ tenantId: 1, key: 1 }, { unique: true });
mediaSchema.index({ tenantId: 1, tags: 1 });
mediaSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
mediaSchema.index({ tenantId: 1, mimeType: 1 });

const Media = mongoose.model('Media', mediaSchema);

module.exports = Media;
