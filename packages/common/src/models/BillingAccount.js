const mongoose = require('mongoose');

const { Schema } = mongoose;

const billingAccountSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, unique: true },
  provider: { type: String, enum: ['manual', 'paddle', 'iyzico'], default: 'manual' },
  externalCustomerId: { type: String, default: null, trim: true },
  status: { type: String, enum: ['pending', 'active', 'restricted', 'closed'], default: 'pending' },
  billingEmail: { type: String, default: '', trim: true, lowercase: true },
  legalName: { type: String, default: '', trim: true },
  country: { type: String, default: '', trim: true, uppercase: true, maxlength: 2 },
  taxId: { type: String, default: '', trim: true },
  currency: { type: String, default: 'USD', trim: true, uppercase: true, maxlength: 3 },
  address: {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city: { type: String, default: '' },
    region: { type: String, default: '' },
    postalCode: { type: String, default: '' },
  },
}, {
  timestamps: true,
  skipTenantEnforcement: true,
});

billingAccountSchema.index(
  { provider: 1, externalCustomerId: 1 },
  { unique: true, partialFilterExpression: { externalCustomerId: { $type: 'string' } } }
);

module.exports = mongoose.models.BillingAccount || mongoose.model('BillingAccount', billingAccountSchema);
