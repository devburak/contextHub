const mongoose = require('mongoose')
const { Schema } = mongoose

const CUSTOM_FIELD_TYPES = [
  'text',
  'number',
  'boolean',
  'date',
  'select',
  'multi-select',
  'url',
  'json',
  'reference',
  'multi-reference'
]

const customFieldDefinitionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  key: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  type: { type: String, enum: CUSTOM_FIELD_TYPES, default: 'text' },
  description: { type: String, default: '' },
  required: { type: Boolean, default: false },
  public: { type: Boolean, default: false },
  filterable: { type: Boolean, default: false },
  searchable: { type: Boolean, default: false },
  options: [{
    label: { type: String, default: '' },
    value: { type: String, default: '' }
  }],
  referenceCollectionKey: { type: String, default: '' },
  defaultValue: { type: Schema.Types.Mixed },
  position: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
})

customFieldDefinitionSchema.pre('save', function (next) {
  this.updatedAt = new Date()
  next()
})

customFieldDefinitionSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updatedAt: new Date() })
  next()
})

customFieldDefinitionSchema.index({ tenantId: 1, key: 1 }, { unique: true })
customFieldDefinitionSchema.index({ tenantId: 1, position: 1, label: 1 })

const CustomFieldDefinition = mongoose.model('CustomFieldDefinition', customFieldDefinitionSchema)

module.exports = CustomFieldDefinition
module.exports.CUSTOM_FIELD_TYPES = CUSTOM_FIELD_TYPES
