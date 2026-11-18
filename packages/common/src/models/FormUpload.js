const mongoose = require('mongoose');
const { Schema } = mongoose;

const UPLOAD_STATUSES = ['pending', 'completed', 'attached', 'promoted', 'expired', 'deleted', 'rejected'];
const SCAN_STATUSES = ['not_scanned', 'pending', 'clean', 'infected', 'error'];

/**
 * A file submitted through a public form. Objects live in the private bucket and
 * are never addressable by a public URL; access is granted per request through
 * short-lived presigned links.
 */
const formUploadSchema = new Schema({
  // Random public identifier. Clients only ever see this value, never _id.
  uploadId: { type: String, required: true },

  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  formId: { type: Schema.Types.ObjectId, ref: 'FormDefinition', required: true },
  fieldId: { type: String, required: true },
  fieldName: { type: String, required: true },
  responseId: { type: Schema.Types.ObjectId, ref: 'FormResponse', default: null },
  sessionId: { type: String, required: true },

  bucket: { type: String, required: true },
  key: { type: String, required: true },
  originalName: { type: String, required: true },
  extension: { type: String, required: true },
  mimeType: { type: String, required: true },
  declaredSize: { type: Number, required: true },
  size: { type: Number },
  sha256: { type: String },

  status: { type: String, enum: UPLOAD_STATUSES, default: 'pending' },
  rejectReason: { type: String },

  // Scanning is done by an external service in a later phase; the fields exist
  // from day one so earlier uploads can be scanned retroactively.
  scanStatus: { type: String, enum: SCAN_STATUSES, default: 'not_scanned' },
  scanFindings: [{ type: Schema.Types.Mixed }],
  scannedAt: { type: Date },

  // Set when an admin moves the file to the public media bucket.
  mediaId: { type: Schema.Types.ObjectId, ref: 'Media' },
  promotedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  promotedAt: { type: Date },

  retainUntil: { type: Date },
  deletedAt: { type: Date },
  deleteReason: { type: String },

  ipHash: { type: String },
  // Presigned link expiry; pending uploads past this point are abandoned.
  expiresAt: { type: Date, required: true },
  completedAt: { type: Date },
  attachedAt: { type: Date }
}, {
  timestamps: true
});

formUploadSchema.index({ uploadId: 1 }, { unique: true });
formUploadSchema.index({ tenantId: 1, formId: 1, status: 1, createdAt: -1 });
formUploadSchema.index({ tenantId: 1, responseId: 1 });
formUploadSchema.index({ tenantId: 1, sessionId: 1, fieldId: 1 });
formUploadSchema.index({ tenantId: 1, status: 1 });
formUploadSchema.index({ status: 1, expiresAt: 1 });

formUploadSchema.statics.UPLOAD_STATUSES = UPLOAD_STATUSES;
formUploadSchema.statics.SCAN_STATUSES = SCAN_STATUSES;

const FormUpload = mongoose.model('FormUpload', formUploadSchema);

module.exports = FormUpload;
