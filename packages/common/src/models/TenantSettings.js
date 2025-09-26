const mongoose = require('mongoose');
const { Schema } = mongoose;

const smtpSchema = new Schema({
  enabled: { type: Boolean, default: false },
  host: { type: String, trim: true },
  port: { type: Number, min: 1, max: 65535 },
  secure: { type: Boolean, default: true },
  username: { type: String, trim: true },
  password: { type: String, select: false },
  fromName: { type: String, trim: true },
  fromEmail: { type: String, trim: true }
}, { _id: false, minimize: false });

const webhookSchema = new Schema({
  enabled: { type: Boolean, default: false },
  url: { type: String, trim: true },
  secret: { type: String, select: false }
}, { _id: false, minimize: false });

const brandingSchema = new Schema({
  siteName: { type: String, trim: true },
  logoUrl: { type: String, trim: true },
  primaryColor: { type: String, trim: true },
  secondaryColor: { type: String, trim: true },
  description: { type: String, trim: true }
}, { _id: false, minimize: false });

const limitsSchema = new Schema({
  entries: { type: Number, min: 0, default: null },
  media: { type: Number, min: 0, default: null },
  users: { type: Number, min: 0, default: null },
  apiCalls: { type: Number, min: 0, default: null },
  emailPerMonth: { type: Number, min: 0, default: null },
  custom: { type: Map, of: Number, default: {} }
}, { _id: false, minimize: false });

const tenantSettingsSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, unique: true, index: true },
  smtp: { type: smtpSchema, default: () => ({}) },
  webhook: { type: webhookSchema, default: () => ({}) },
  branding: { type: brandingSchema, default: () => ({}) },
  limits: { type: limitsSchema, default: () => ({}) },
  features: { type: Map, of: Boolean, default: () => ({}) },
  metadata: { type: Map, of: Schema.Types.Mixed, default: () => ({}) }
}, {
  timestamps: true,
  minimize: false
});

tenantSettingsSchema.index({ tenantId: 1 }, { unique: true });

const TenantSettings = mongoose.model('TenantSettings', tenantSettingsSchema);

module.exports = TenantSettings;
