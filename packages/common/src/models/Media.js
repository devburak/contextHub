const mongoose = require('mongoose');
const { Schema } = mongoose;

const mediaVariantSchema = new Schema({
  name: { type: String, required: true },
  url: { type: String, required: true }
}, { _id: false });

const mediaSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  key: { type: String, required: true },
  bucket: { type: String, required: true },
  url: { type: String },
  isPublic: { type: Boolean, default: false },
  contentType: { type: String },
  size: { type: Number },
  width: { type: Number },
  height: { type: Number },
  etag: { type: String },
  variants: [mediaVariantSchema],
  alt: { type: Schema.Types.Mixed },
  tags: [{ type: String }],
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

const Media = mongoose.model('Media', mediaSchema);

module.exports = Media;
