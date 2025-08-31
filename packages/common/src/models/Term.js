const mongoose = require('mongoose');
const { Schema } = mongoose;

const termSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  taxonomyId: { type: Schema.Types.ObjectId, ref: 'Taxonomy', required: true },
  slug: { type: String, required: true },
  title: { type: Schema.Types.Mixed }, // e.g., { en: 'Announcements', tr: 'Duyurular' }
  parentId: { type: Schema.Types.ObjectId, ref: 'Term' },
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
termSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
termSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Indexes
termSchema.index({ tenantId: 1, taxonomyId: 1, slug: 1 }, { unique: true });
termSchema.index({ tenantId: 1, parentId: 1 });

const Term = mongoose.model('Term', termSchema);

module.exports = Term;
