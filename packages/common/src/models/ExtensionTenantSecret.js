const mongoose = require('mongoose');

const { Schema } = mongoose;

const extensionTenantSecretSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    plugin: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    ciphertext: { type: String, required: true, select: false },
    revision: { type: Number, min: 1, required: true, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    collection: 'ExtensionTenantSecrets',
    skipTenantEnforcement: true,
    timestamps: true,
    versionKey: false
  }
);

extensionTenantSecretSchema.index(
  { tenantId: 1, plugin: 1, key: 1 },
  { unique: true }
);

const ExtensionTenantSecret = mongoose.model(
  'ExtensionTenantSecret',
  extensionTenantSecretSchema
);

module.exports = ExtensionTenantSecret;
