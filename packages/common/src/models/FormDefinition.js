const mongoose = require('mongoose');
const { Schema } = mongoose;

const formFieldSchema = new Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, required: true },
  required: { type: Boolean, default: false },
  validation: { type: Schema.Types.Mixed }
}, { _id: false });

const webhookSchema = new Schema({
  url: { type: String, required: true },
  secret: { type: String },
  events: [{ type: String }]
}, { _id: false });

const formDefinitionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true },
  slug: { type: String, required: true },
  fields: [formFieldSchema],
  webhooks: [webhookSchema],
  notifications: {
    email: [{ type: String }],
    sms: [{ type: String }]
  },
  antispam: { type: Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
formDefinitionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
formDefinitionSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Index
formDefinitionSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

const FormDefinition = mongoose.model('FormDefinition', formDefinitionSchema);

module.exports = FormDefinition;
