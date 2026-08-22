const mongoose = require('mongoose');

const { Schema } = mongoose;

const quotaAlertSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  metric: { type: String, enum: ['users', 'owners', 'storage', 'requests'], required: true },
  periodKey: { type: String, required: true, trim: true },
  threshold: { type: Number, enum: [80, 90, 100], required: true },
  usage: { type: Number, required: true, min: 0 },
  limit: { type: Number, required: true, min: 0 },
  notificationStatus: {
    type: String,
    enum: ['pending', 'sending', 'sent', 'partial', 'failed', 'no_recipients'],
    default: 'pending',
  },
  notificationAttempts: { type: Number, default: 0, min: 0 },
  notificationRecipientCount: { type: Number, default: 0, min: 0 },
  notificationSuccessCount: { type: Number, default: 0, min: 0 },
  lastNotificationError: { type: String, default: '' },
  notifiedAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
}, { timestamps: true });

quotaAlertSchema.index({ tenantId: 1, metric: 1, periodKey: 1, threshold: 1 }, { unique: true });

module.exports = mongoose.models.QuotaAlert || mongoose.model('QuotaAlert', quotaAlertSchema);
