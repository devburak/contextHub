const mongoose = require('mongoose');

const { Schema } = mongoose;

const billingSubscriptionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true },
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  billingAccountId: { type: Schema.Types.ObjectId, ref: 'BillingAccount', required: true },
  provider: { type: String, enum: ['manual', 'paddle', 'iyzico'], required: true },
  externalSubscriptionId: { type: String, default: null, trim: true },
  planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', default: null },
  planPriceId: { type: Schema.Types.ObjectId, ref: 'PlanPrice', default: null },
  status: {
    type: String,
    enum: ['pending', 'trialing', 'active', 'past_due', 'paused', 'canceled', 'expired'],
    default: 'pending',
    index: true,
  },
  interval: { type: String, enum: ['month', 'year'], default: 'month' },
  currency: { type: String, default: 'USD', trim: true, uppercase: true },
  amountMinor: { type: Number, default: 0, min: 0 },
  currentPeriodStart: { type: Date, default: null },
  currentPeriodEnd: { type: Date, default: null },
  trialEndsAt: { type: Date, default: null },
  cancelAtPeriodEnd: { type: Boolean, default: false },
  canceledAt: { type: Date, default: null },
  gracePeriodEndsAt: { type: Date, default: null },
  scheduledPlanId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', default: null },
  scheduledPlanPriceId: { type: Schema.Types.ObjectId, ref: 'PlanPrice', default: null },
  lastProviderEventAt: { type: Date, default: null },
}, {
  timestamps: true,
  skipTenantEnforcement: true,
});

billingSubscriptionSchema.index(
  { provider: 1, externalSubscriptionId: 1 },
  { unique: true, partialFilterExpression: { externalSubscriptionId: { $type: 'string' } } }
);

module.exports = mongoose.models.BillingSubscription || mongoose.model('BillingSubscription', billingSubscriptionSchema);
