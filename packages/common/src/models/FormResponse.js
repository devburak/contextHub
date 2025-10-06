const mongoose = require('mongoose');
const { Schema } = mongoose;

// File attachment schema
const fileAttachmentSchema = new Schema({
  fieldId: { type: String, required: true },
  mediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
  filename: { type: String },
  size: { type: Number },
  mimeType: { type: String },
  url: { type: String }
}, { _id: false });

// Geo-location schema
const geoLocationSchema = new Schema({
  country: { type: String },
  countryCode: { type: String },
  city: { type: String },
  region: { type: String },
  coordinates: {
    lat: { type: Number },
    lng: { type: Number }
  }
}, { _id: false });

// Device information schema
const deviceInfoSchema = new Schema({
  type: { type: String, enum: ['desktop', 'mobile', 'tablet', 'unknown'] },
  os: { type: String },
  browser: { type: String },
  screenResolution: { type: String }
}, { _id: false });

const formResponseSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  formId: { type: Schema.Types.ObjectId, ref: 'FormDefinition', required: true, index: true },
  formVersion: { type: Number, required: true }, // Which version of the form was submitted
  
  // Response data - field id to value mapping
  data: { type: Schema.Types.Mixed, required: true },
  
  // File uploads
  files: [fileAttachmentSchema],
  
  // Submission metadata
  source: { 
    type: String, 
    enum: ['web', 'mobile', 'api', 'embed', 'unknown'], 
    default: 'web' 
  },
  locale: { type: String, default: 'en' },
  userAgent: { type: String },
  ip: { type: String }, // Hashed for privacy
  ipRaw: { type: String, select: false }, // Raw IP (only for admins, not in default queries)
  geo: geoLocationSchema,
  device: deviceInfoSchema,
  referrer: { type: String },
  
  // User identification (if authenticated)
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  userEmail: { type: String },
  userName: { type: String },
  
  // Status & processing
  status: { 
    type: String, 
    enum: ['pending', 'processed', 'spam', 'deleted'], 
    default: 'pending',
    index: true
  },
  flaggedAsSpam: { type: Boolean, default: false },
  spamScore: { type: Number, default: 0 },
  
  // Webhook delivery tracking
  webhookDelivered: { type: Boolean, default: false },
  webhookDeliveredAt: { type: Date },
  webhookAttempts: { type: Number, default: 0 },
  webhookLastError: { type: String },
  
  // Notification tracking
  notificationSent: { type: Boolean, default: false },
  notificationSentAt: { type: Date },
  
  // Additional metadata
  meta: { type: Schema.Types.Mixed }, // Custom metadata from integrations
  
  // Audit fields
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date },
  processedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' } // For admin-created responses
});

// Pre-save middleware to update updatedAt field
formResponseSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
formResponseSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Indexes for common queries
formResponseSchema.index({ tenantId: 1, formId: 1, createdAt: -1 });
formResponseSchema.index({ tenantId: 1, status: 1 });
formResponseSchema.index({ tenantId: 1, formId: 1, status: 1 });
formResponseSchema.index({ ip: 1, createdAt: -1 }); // For rate limiting
formResponseSchema.index({ userId: 1 }); // For user's own responses
formResponseSchema.index({ flaggedAsSpam: 1, status: 1 }); // For spam management

// Static method to get response count for a form
formResponseSchema.statics.getFormResponseCount = async function(formId, filters = {}) {
  const query = { formId, ...filters };
  return await this.countDocuments(query);
};

// Static method to get responses with pagination
formResponseSchema.statics.getResponses = async function(formId, { page = 1, limit = 20, status, startDate, endDate } = {}) {
  const query = { formId };
  
  if (status) query.status = status;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const skip = (page - 1) * limit;
  const responses = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('files.mediaId', 'filename url size mimeType')
    .populate('userId', 'firstName lastName email')
    .lean();
  
  const total = await this.countDocuments(query);
  
  return {
    responses,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Method to hash IP for privacy
formResponseSchema.methods.hashIp = function(ip) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(ip).digest('hex');
};

const FormResponse = mongoose.model('FormResponse', formResponseSchema);

module.exports = FormResponse;
