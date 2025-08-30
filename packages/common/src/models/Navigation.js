const mongoose = require('mongoose');
const { Schema } = mongoose;

const navItemSchema = new Schema({
  title: { type: String, required: true },
  url: { type: String },
  refEntryId: { type: Schema.Types.ObjectId, ref: 'Entry' },
  children: [this]
}, { _id: false });

const navigationSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  site: {
    domainId: { type: Schema.Types.ObjectId, ref: 'Domain' }
  },
  name: { type: String, required: true },
  items: [navItemSchema],
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
navigationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
navigationSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Index
navigationSchema.index({ tenantId: 1, 'site.domainId': 1, name: 1 });

const Navigation = mongoose.model('Navigation', navigationSchema);

module.exports = Navigation;
