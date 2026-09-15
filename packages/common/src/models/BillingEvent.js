const mongoose = require('mongoose');

const { Schema } = mongoose;

const billingEventSchema = new Schema({
  provider: { type: String, enum: ['manual', 'paddle', 'iyzico'], required: true },
  eventId: { type: String, required: true, trim: true },
  eventType: { type: String, required: true, trim: true },
  occurredAt: { type: Date, required: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', default: null, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  externalCustomerId: { type: String, default: null },
  externalSubscriptionId: { type: String, default: null },
  payloadHash: { type: String, required: true },
  // Only the allow-listed fields required to reconcile the event are stored.
  // The hash and provider event ID remain after the minimized payload is
  // redacted so duplicate detection and the audit trail keep working.
  payload: { type: Schema.Types.Mixed, default: null },
  payloadExpiresAt: { type: Date, default: null },
  payloadRedactedAt: { type: Date, default: null },
  status: { type: String, enum: ['pending', 'processing', 'processed', 'ignored', 'failed'], default: 'pending' },
  attempts: { type: Number, default: 0 },
  processedAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
}, {
  timestamps: true,
  skipTenantEnforcement: true,
});

billingEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
billingEventSchema.index({ status: 1, occurredAt: 1 });
billingEventSchema.index({ status: 1, payloadExpiresAt: 1 });

module.exports = mongoose.models.BillingEvent || mongoose.model('BillingEvent', billingEventSchema);
