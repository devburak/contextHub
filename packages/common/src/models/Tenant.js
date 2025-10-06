const mongoose = require('mongoose');
const { Schema } = mongoose;

const tenantSchema = new Schema({
  name: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  plan: { type: String, default: 'free' },
  status: { type: String, default: 'active', enum: ['active', 'inactive', 'suspended'] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
tenantSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
tenantSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Index
tenantSchema.index({ slug: 1 }, { unique: true });

const Tenant = mongoose.model('Tenant', tenantSchema);

module.exports = Tenant;
