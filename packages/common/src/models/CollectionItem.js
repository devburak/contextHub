const mongoose = require('mongoose');
const { Schema } = mongoose;

const collectionItemSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  collectionId: { type: Schema.Types.ObjectId, ref: 'CollectionDef', required: true },
  data: { type: Schema.Types.Mixed },
  status: { type: String, enum: ['draft','published','archived'], default: 'draft' },
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
collectionItemSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
collectionItemSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Index
collectionItemSchema.index({ tenantId: 1, collectionId: 1, status: 1 });

const CollectionItem = mongoose.model('CollectionItem', collectionItemSchema);

module.exports = CollectionItem;
