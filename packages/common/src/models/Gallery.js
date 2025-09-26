const mongoose = require('mongoose');
const { Schema } = mongoose;

const galleryItemSchema = new Schema({
  mediaId: { type: Schema.Types.ObjectId, ref: 'Media', required: true },
  title: { type: String, trim: true },
  caption: { type: String, trim: true },
  order: { type: Number, default: 0 }
}, { _id: false });

const gallerySchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  items: { type: [galleryItemSchema], default: [] },
  linkedContentIds: { type: [Schema.Types.ObjectId], ref: 'Content', default: [] },
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

gallerySchema.index({ tenantId: 1, title: 1 });

gallerySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

gallerySchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model('Gallery', gallerySchema);
