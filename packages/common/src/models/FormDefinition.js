const mongoose = require('mongoose');
const { Schema } = mongoose;

// Field option schema for select, radio, checkbox fields
const fieldOptionSchema = new Schema({
  value: { type: String, required: true },
  label: { type: Schema.Types.Mixed } // i18n map: { en: "...", tr: "..." }
}, { _id: false });

// Conditional logic schema
const conditionalLogicSchema = new Schema({
  field: { type: String }, // field id to check
  operator: { 
    type: String, 
    enum: ['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan', 'isEmpty', 'isNotEmpty']
  },
  value: { type: Schema.Types.Mixed }
}, { _id: false });

// Field validation schema
const fieldValidationSchema = new Schema({
  min: { type: Number },
  max: { type: Number },
  pattern: { type: String }, // regex pattern
  fileTypes: [{ type: String }], // allowed file MIME types
  maxFileSize: { type: Number }, // in MB
  customMessage: { type: Schema.Types.Mixed } // i18n error messages
}, { _id: false });

// Form field schema with comprehensive options
const formFieldSchema = new Schema({
  id: { type: String, required: true }, // UUID
  type: { 
    type: String, 
    required: true,
    enum: ['text', 'number', 'select', 'radio', 'checkbox', 'date', 'file', 
           'email', 'phone', 'rating', 'hidden', 'textarea', 'section']
  },
  name: { type: String, required: true }, // Field name for form submission
  label: { type: Schema.Types.Mixed }, // i18n map
  placeholder: { type: Schema.Types.Mixed }, // i18n map
  helpText: { type: Schema.Types.Mixed }, // i18n map
  required: { type: Boolean, default: false },
  validation: fieldValidationSchema,
  options: [fieldOptionSchema], // for select, radio, checkbox
  conditionalLogic: conditionalLogicSchema,
  defaultValue: { type: Schema.Types.Mixed },
  order: { type: Number, default: 0 },
  // Additional styling/behavior properties
  width: { type: String, enum: ['full', 'half', 'third', 'quarter'] },
  className: { type: String },
  readOnly: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  hidden: { type: Boolean, default: false }
}, { _id: false });

// Webhook schema
const webhookSchema = new Schema({
  url: { type: String, required: true },
  secret: { type: String },
  events: [{ type: String, enum: ['submission', 'update', 'delete'] }],
  enabled: { type: Boolean, default: true }
}, { _id: false });

// Form settings schema
const emailNotificationSchema = new Schema({
  enabled: { type: Boolean, default: false },
  recipients: [{ type: String }],
  subject: { type: String },
  replyTo: { type: String }
}, { _id: false });

const formSettingsSchema = new Schema({
  submitButtonText: { type: Schema.Types.Mixed, default: { en: 'Submit', tr: 'Gönder' } },
  successMessage: { type: Schema.Types.Mixed, default: { en: 'Thank you for your submission!', tr: 'Gönderiminiz için teşekkürler!' } },
  redirectUrl: { type: String },
  enableCaptcha: { type: Boolean, default: false },
  enableHoneypot: { type: Boolean, default: true },
  allowMultipleSubmissions: { type: Boolean, default: true },
  submitLimit: { type: Number }, // max submissions per user
  submissionCooldownSeconds: { type: Number, default: 60, min: 0, max: 3600 }, // cooldown between submissions (0-3600 seconds)
  enableNotifications: { type: Boolean, default: false },
  notificationEmails: [{ type: String }],
  emailNotifications: { type: emailNotificationSchema, default: {} },
  webhookUrl: { type: String },
  requireAuth: { type: Boolean, default: false }, // require authenticated users
  collectGeo: { type: Boolean, default: false }, // collect geo-location
  collectDevice: { type: Boolean, default: true } // collect device info
}, { _id: false });

const formDefinitionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  
  // Basic info
  title: { type: Schema.Types.Mixed, required: true }, // i18n map
  slug: { type: String, required: true, trim: true },
  description: { type: Schema.Types.Mixed }, // i18n map
  
  // Form structure
  fields: [formFieldSchema],
  
  // Publication & visibility
  status: { 
    type: String, 
    enum: ['draft', 'published', 'archived'], 
    default: 'draft',
    index: true
  },
  visibility: { 
    type: String, 
    enum: ['public', 'authenticated'], 
    default: 'public' 
  },
  
  // Versioning
  version: { type: Number, default: 1 },
  lastVersionId: { type: Schema.Types.ObjectId, ref: 'FormVersion' },
  
  // Settings
  settings: { type: formSettingsSchema, default: {} },
  
  // Legacy webhook support (kept for backwards compatibility)
  webhooks: [webhookSchema],
  
  // Analytics metadata
  submissionCount: { type: Number, default: 0, index: true },
  lastSubmissionAt: { type: Date },
  
  // Audit fields
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  publishedAt: { type: Date }
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

// Indexes for common queries
formDefinitionSchema.index({ tenantId: 1, slug: 1 }, { unique: true });
formDefinitionSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
formDefinitionSchema.index({ tenantId: 1, submissionCount: -1 });

// Virtual for getting title in default locale (for queries)
formDefinitionSchema.virtual('titleText').get(function() {
  if (typeof this.title === 'string') return this.title;
  return this.title?.en || this.title?.tr || Object.values(this.title || {})[0] || 'Untitled Form';
});

const FormDefinition = mongoose.model('FormDefinition', formDefinitionSchema);

module.exports = FormDefinition;
