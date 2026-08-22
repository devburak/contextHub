const mongoose = require('mongoose');

const { Schema } = mongoose;

const billingInvoiceSchema = new Schema({
  accountId: { type: Schema.Types.ObjectId, ref: 'Account', required: true, index: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  billingSubscriptionId: { type: Schema.Types.ObjectId, ref: 'BillingSubscription', default: null },
  provider: { type: String, enum: ['manual', 'paddle', 'iyzico'], required: true },
  // Internal reconciliation detail. Owner-facing APIs intentionally omit it:
  // Enterprise customers see one unified invoice history regardless of whether
  // an amount came from metered usage or a negotiated fixed contract.
  commercialModel: {
    type: String,
    enum: ['fixed_subscription', 'metered_usage', 'negotiated_contract'],
    default: 'fixed_subscription',
    select: false,
  },
  externalTransactionId: { type: String, required: true, trim: true },
  invoiceNumber: { type: String, default: '', trim: true },
  status: { type: String, enum: ['draft', 'open', 'paid', 'past_due', 'void', 'refunded'], default: 'draft' },
  currency: { type: String, required: true, trim: true, uppercase: true },
  subtotalMinor: { type: Number, default: 0, min: 0 },
  taxMinor: { type: Number, default: 0, min: 0 },
  totalMinor: { type: Number, default: 0, min: 0 },
  billedAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  periodStart: { type: Date, default: null },
  periodEnd: { type: Date, default: null },
  documentUrl: { type: String, default: '' },
}, {
  timestamps: true,
  skipTenantEnforcement: true,
});

billingInvoiceSchema.index({ provider: 1, externalTransactionId: 1 }, { unique: true });
billingInvoiceSchema.index({ accountId: 1, billedAt: -1 });
billingInvoiceSchema.index({ tenantId: 1, billedAt: -1 });

module.exports = mongoose.models.BillingInvoice || mongoose.model('BillingInvoice', billingInvoiceSchema);
