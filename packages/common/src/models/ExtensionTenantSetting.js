const mongoose = require('mongoose');

const { Schema } = mongoose;

const extensionTenantSettingSchema = new Schema(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
    plugin: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    revision: { type: Number, min: 1, required: true, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  {
    collection: 'ExtensionTenantSettings',
    skipTenantEnforcement: true,
    timestamps: true,
    versionKey: false
  }
);

extensionTenantSettingSchema.index(
  { tenantId: 1, plugin: 1, key: 1 },
  { unique: true }
);

const ExtensionTenantSetting = mongoose.model(
  'ExtensionTenantSetting',
  extensionTenantSettingSchema
);

module.exports = ExtensionTenantSetting;
