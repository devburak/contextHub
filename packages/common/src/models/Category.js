const mongoose = require('mongoose')
const { Schema } = mongoose

const categorySchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  parentId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  ancestors: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
  position: { type: Number, default: 0 },
  defaultSortField: { type: String, default: 'createdAt' },
  defaultSortOrder: { type: String, enum: ['asc', 'desc'], default: 'desc' },
  settings: { type: Map, of: Schema.Types.Mixed },
  metadata: { type: Map, of: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
})

categorySchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

categorySchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() })
  next()
})

categorySchema.index({ tenantId: 1, slug: 1 }, { unique: true })
categorySchema.index({ tenantId: 1, parentId: 1, position: 1 })
categorySchema.index({ tenantId: 1, name: 1 })

const Category = mongoose.model('Category', categorySchema)

module.exports = Category
