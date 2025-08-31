const mongoose = require('mongoose');
const { Schema } = mongoose;

const domainSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  host: { type: String, required: true, unique: true },
  isPrimary: { type: Boolean, default: false },
  siteId: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
domainSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
domainSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Indexes
domainSchema.index({ host: 1 }, { unique: true });
domainSchema.index({ tenantId: 1, host: 1 });

const Domain = mongoose.model('Domain', domainSchema);

module.exports = Domain;
