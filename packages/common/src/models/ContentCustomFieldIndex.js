const mongoose = require('mongoose')
const { Schema } = mongoose

const contentCustomFieldIndexSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  contentId: { type: Schema.Types.ObjectId, ref: 'Content', required: true },
  key: { type: String, required: true, trim: true },
  valueString: { type: String },
  valueNumber: { type: Number },
  valueBoolean: { type: Boolean },
  valueDate: { type: Date },
  valueTokens: [{ type: String }],
  status: { type: String, enum: ['draft', 'scheduled', 'published', 'archived'], default: 'draft' },
  publishedAt: { type: Date },
  updatedAt: { type: Date, default: Date.now }
})

contentCustomFieldIndexSchema.index({ tenantId: 1, contentId: 1, key: 1 })
contentCustomFieldIndexSchema.index({ tenantId: 1, key: 1, valueString: 1, status: 1, publishedAt: -1 })
contentCustomFieldIndexSchema.index({ tenantId: 1, key: 1, valueNumber: 1, status: 1, publishedAt: -1 })
contentCustomFieldIndexSchema.index({ tenantId: 1, key: 1, valueBoolean: 1, status: 1, publishedAt: -1 })
contentCustomFieldIndexSchema.index({ tenantId: 1, key: 1, valueDate: 1, status: 1, publishedAt: -1 })
contentCustomFieldIndexSchema.index({ tenantId: 1, key: 1, valueTokens: 1, status: 1, publishedAt: -1 })

const ContentCustomFieldIndex = mongoose.model('ContentCustomFieldIndex', contentCustomFieldIndexSchema)

module.exports = ContentCustomFieldIndex
