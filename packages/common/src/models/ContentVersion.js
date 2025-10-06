const mongoose = require('mongoose')
const { Schema } = mongoose

const contentVersionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: true },
  version: { type: Number, required: true },
  title: { type: String, required: true },
  slug: { type: String, required: true },
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
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedAt: { type: Date },
  deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  deletedByName: { type: String }
})

contentVersionSchema.index({ tenantId: 1, contentId: 1, version: -1 }, { unique: true })
contentVersionSchema.index({ tenantId: 1, contentId: 1, deletedAt: 1 })

const ContentVersion = mongoose.model('ContentVersion', contentVersionSchema)

module.exports = ContentVersion
