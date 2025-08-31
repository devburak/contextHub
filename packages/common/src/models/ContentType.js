const mongoose = require('mongoose');
const { Schema } = mongoose;

const fieldSchema = new Schema({
  key: { type: String, required: true },
  type: { type: String, required: true },
  options: { type: Schema.Types.Mixed },
  required: { type: Boolean, default: false },
  i18n: { type: Boolean, default: false }
}, { _id: false });

const contentTypeSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true },
  apiName: { type: String, required: true },
  fields: [fieldSchema],
  options: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
contentTypeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
contentTypeSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Index
contentTypeSchema.index({ tenantId: 1, apiName: 1 }, { unique: true });

const ContentType = mongoose.model('ContentType', contentTypeSchema);

module.exports = ContentType;
