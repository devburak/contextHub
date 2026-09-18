const mongoose = require('mongoose');
const { Schema } = mongoose;

// Durable financial intent, NOT a TTL checkout session. Ambiguous provider
// writes stay locked for reconciliation and can never trigger a second charge.
const schema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
  subscriptionId: { type: Schema.Types.ObjectId, ref: 'BillingSubscription', required: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  active: { type: Boolean, default: true },
  status: { type: String, enum: ['quoted', 'initializing', 'awaiting_payment', 'payment_confirmed', 'upgrade_requested', 'scheduled', 'completed', 'needs_review', 'expired'], default: 'quoted' },
  fromPriceId: { type: Schema.Types.ObjectId, ref: 'PlanPrice', required: true },
  toPriceId: { type: Schema.Types.ObjectId, ref: 'PlanPrice', required: true },
  fromExternalPriceId: { type: String, required: true },
  toExternalPriceId: { type: String, required: true },
  fromPlanName: { type: String, required: true },
  toPlanName: { type: String, required: true },
  currentAmountMinor: { type: Number, required: true },
  recurringAmountMinor: { type: Number, required: true },
  amountMinor: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: ['TRY'], required: true },
  interval: { type: String, enum: ['month', 'year'], required: true },
  policyVersion: { type: String, default: 'remaining-time-v1' },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  quotedAt: { type: Date, required: true },
  quoteExpiresAt: { type: Date, required: true },
  acceptedAt: Date,
  checkoutExpiresAt: Date,
  conversationId: String,
  tokenHash: { type: String, select: false },
  tokenEncrypted: { type: String, select: false },
  checkoutEncrypted: { type: String, select: false },
  nextCheckAt: Date,
  externalPaymentId: String,
  paidAt: Date,
  entitlementAppliedAt: Date,
  externalSubscriptionId: { type: String, required: true },
  nextExternalSubscriptionId: String,
  upgradeRequestedAt: Date,
  completedAt: Date,
  lastError: { type: String, default: '', maxlength: 1000 },
}, { timestamps: true, skipTenantEnforcement: true });

schema.index({ tenantId: 1 }, { unique: true, partialFilterExpression: { active: true } });
schema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } });
schema.index({ externalPaymentId: 1 }, { unique: true, partialFilterExpression: { externalPaymentId: { $type: 'string' } } });
schema.index({ status: 1, updatedAt: 1 });
module.exports = mongoose.models.BillingPlanChange || mongoose.model('BillingPlanChange', schema);
