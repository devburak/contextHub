const mongoose = require('mongoose');
const { Schema } = mongoose;

const templateSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true },
  type: { type: String, enum: ['email','sms'], required: true },
  language: { type: String, default: 'en' },
  subject: { type: String },
  body: { type: String }, // React Email veya MJML render edilmiş HTML
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
templateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
templateSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Index
templateSchema.index({ tenantId: 1, name: 1, type: 1 }, { unique: true });

const Template = mongoose.model('Template', templateSchema);

module.exports = Template;
