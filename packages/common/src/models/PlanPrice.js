const mongoose = require('mongoose');

const { Schema } = mongoose;

const planPriceSchema = new Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
  },
  planId: { type: Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true, index: true },
  provider: { type: String, enum: ['manual', 'paddle', 'iyzico'], required: true },
  interval: { type: String, enum: ['month', 'year'], required: true },
  currency: { type: String, required: true, trim: true, uppercase: true, minlength: 3, maxlength: 3 },
  amountMinor: { type: Number, required: true, min: 0 },
  externalPriceId: { type: String, default: null, trim: true },
  active: { type: Boolean, default: true, index: true },
  effectiveFrom: { type: Date, default: Date.now },
  effectiveUntil: { type: Date, default: null },
}, {
  timestamps: true,
  skipTenantEnforcement: true,
});

planPriceSchema.index({ planId: 1, provider: 1, interval: 1, currency: 1, active: 1 });
planPriceSchema.index(
  { provider: 1, externalPriceId: 1 },
  { unique: true, partialFilterExpression: { externalPriceId: { $type: 'string' } } }
);

module.exports = mongoose.models.PlanPrice || mongoose.model('PlanPrice', planPriceSchema);
