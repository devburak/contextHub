const mongoose = require('mongoose');

const { Schema } = mongoose;

const billingAccountSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, unique: true },
  provider: { type: String, enum: ['manual', 'paddle', 'iyzico'], default: 'manual' },
  externalCustomerId: { type: String, default: null, trim: true },
  status: { type: String, enum: ['pending', 'active', 'restricted', 'closed'], default: 'pending' },
  billingEmail: { type: String, default: '', trim: true, lowercase: true },
  legalName: { type: String, default: '', trim: true },
  profileType: { type: String, enum: ['individual', 'business'], default: 'business' },
  contactFirstName: { type: String, default: '', trim: true },
  contactLastName: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  country: { type: String, default: '', trim: true, uppercase: true, maxlength: 2 },
  // Legacy plaintext field. New writes use taxIdEncrypted and explicitly unset this field.
  taxId: { type: String, default: '', trim: true, select: false },
  taxIdEncrypted: { type: String, default: '', select: false },
  taxIdLast4: { type: String, default: '', trim: true, maxlength: 4 },
  taxOffice: { type: String, default: '', trim: true },
  currency: { type: String, default: 'USD', trim: true, uppercase: true, maxlength: 3 },
  address: {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city: { type: String, default: '' },
    district: { type: String, default: '' },
    region: { type: String, default: '' },
    postalCode: { type: String, default: '' },
  },
  declarationVersion: { type: String, default: '' },
  declarationAcceptedAt: { type: Date, default: null },
  declarationAcceptedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  serviceAgreementVersion: { type: String, default: '' },
  serviceAgreementAcceptedAt: { type: Date, default: null },
  serviceAgreementAcceptedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  billingProfileStatus: {
    type: String,
    enum: ['incomplete', 'declared', 'legacy_enterprise'],
    default: 'incomplete',
  },
  paymentMethodStatus: {
    type: String,
    enum: ['none', 'provider_verified', 'enterprise_contract'],
    default: 'none',
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
