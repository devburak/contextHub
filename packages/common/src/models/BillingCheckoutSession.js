const mongoose = require('mongoose');

const { Schema } = mongoose;

const billingCheckoutSessionSchema = new Schema({
  provider: { type: String, enum: ['paddle', 'iyzico'], required: true },
  checkoutMode: {
    type: String,
    enum: ['subscription', 'review_checkout'],
    default: 'subscription',
  },
  tokenHash: { type: String, required: true, select: false },
  conversationId: { type: String, required: true, trim: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  planPriceId: { type: Schema.Types.ObjectId, ref: 'PlanPrice', required: true },
  expectedAmountMinor: { type: Number, default: null, min: 0 },
  expectedCurrency: { type: String, default: null, trim: true, uppercase: true },
  status: { type: String, enum: ['initialized', 'completed', 'failed', 'expired'], default: 'initialized', index: true },
  expiresAt: { type: Date, required: true, index: true },
  completedAt: { type: Date, default: null },
  externalSubscriptionId: { type: String, default: null, trim: true },
  externalCustomerId: { type: String, default: null, trim: true },
  externalTransactionId: { type: String, default: null, trim: true },
  verifiedAmountMinor: { type: Number, default: null, min: 0 },
  verifiedCurrency: { type: String, default: null, trim: true, uppercase: true },
  verifiedAt: { type: Date, default: null },
  lastError: { type: String, default: '' },
}, {
  timestamps: true,
  skipTenantEnforcement: true,
});

billingCheckoutSessionSchema.index({ provider: 1, tokenHash: 1 }, { unique: true });
billingCheckoutSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.models.BillingCheckoutSession
  || mongoose.model('BillingCheckoutSession', billingCheckoutSessionSchema);
