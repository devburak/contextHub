const mongoose = require('mongoose');
const { Schema } = mongoose;

const productVariantSchema = new Schema({
  sku: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number },
  attrs: { type: Schema.Types.Mixed }
}, { _id: false });

const productSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  slug: { type: String, required: true },
  title: { type: Schema.Types.Mixed },
  description: { type: Schema.Types.Mixed },
  images: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  categories: [{ type: Schema.Types.ObjectId, ref: 'Term' }],
  attributes: [{ key: String, value: String }],
  variants: [productVariantSchema],
  status: { type: String, enum: ['active','inactive','draft'], default: 'draft' },
  meta: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
productSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
productSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Indexes
productSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
productSchema.index({ tenantId: 1, status: 1 });
productSchema.index({ tenantId: 1, 'attributes.key': 1, 'attributes.value': 1 });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
