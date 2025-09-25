const mongoose = require('mongoose')
const { Schema } = mongoose

const contentSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  title: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true },
  status: { type: String, enum: ['draft', 'scheduled', 'published', 'archived'], default: 'draft' },
  summary: { type: String, default: '' },
  lexical: { type: Schema.Types.Mixed },
  html: { type: String },
  featuredMediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
  categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
  tags: [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
  authorName: { type: String, default: '' },
  publishAt: { type: Date },
  publishedAt: { type: Date },
  publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  version: { type: Number, default: 1 },
  lastVersionId: { type: Schema.Types.ObjectId, ref: 'ContentVersion' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
})

contentSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

contentSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() })
  next()
})

contentSchema.index({ tenantId: 1, slug: 1 }, { unique: true })
contentSchema.index({ tenantId: 1, status: 1, publishAt: 1 })
contentSchema.index({ tenantId: 1, categories: 1 })
contentSchema.index({ tenantId: 1, tags: 1 })

const Content = mongoose.model('Content', contentSchema)

module.exports = Content
