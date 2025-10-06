const mongoose = require('mongoose');
const { Schema } = mongoose;

const featureFlagDefinitionSchema = new Schema({
  key: { type: String, required: true, unique: true, trim: true },
  label: { type: String, required: true, trim: true },
  description: { type: String, default: '', trim: true },
  defaultEnabled: { type: Boolean, default: false },
  notes: { type: String, default: '', trim: true }
}, {
  timestamps: true
});

featureFlagDefinitionSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('FeatureFlagDefinition', featureFlagDefinitionSchema);
