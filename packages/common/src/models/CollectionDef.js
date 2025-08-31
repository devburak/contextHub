const mongoose = require('mongoose');
const { Schema } = mongoose;

const collectionDefSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true },
  apiName: { type: String, required: true },
  schemaJson: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
collectionDefSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
collectionDefSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Index
collectionDefSchema.index({ tenantId: 1, apiName: 1 }, { unique: true });

const CollectionDef = mongoose.model('CollectionDef', collectionDefSchema);

module.exports = CollectionDef;
