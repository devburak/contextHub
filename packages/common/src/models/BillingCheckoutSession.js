const mongoose = require('mongoose');

const { Schema } = mongoose;

const billingCheckoutSessionSchema = new Schema({
  provider: { type: String, enum: ['paddle', 'iyzico'], required: true },
  tokenHash: { type: String, required: true, select: false },
  conversationId: { type: String, required: true, trim: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  planPriceId: { type: Schema.Types.ObjectId, ref: 'PlanPrice', required: true },
  status: { type: String, enum: ['initialized', 'completed', 'failed', 'expired'], default: 'initialized', index: true },
  expiresAt: { type: Date, required: true, index: true },
  completedAt: { type: Date, default: null },
  externalSubscriptionId: { type: String, default: null, trim: true },
  externalCustomerId: { type: String, default: null, trim: true },
  lastError: { type: String, default: '' },
}, {
  timestamps: true,
  skipTenantEnforcement: true,
});

billingCheckoutSessionSchema.index({ provider: 1, tokenHash: 1 }, { unique: true });
billingCheckoutSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.BillingCheckoutSession
  || mongoose.model('BillingCheckoutSession', billingCheckoutSessionSchema);
