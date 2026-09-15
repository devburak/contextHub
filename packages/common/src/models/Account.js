const mongoose = require('mongoose');

const { Schema } = mongoose;

const accountSchema = new Schema({
  name: { type: String, required: true, trim: true },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/,
  },
  status: {
    type: String,
    enum: ['active', 'delinquent', 'suspended', 'closed'],
    default: 'active',
    index: true,
  },
  ownerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, {
  timestamps: true,
  skipTenantEnforcement: true,
});

module.exports = mongoose.models.Account || mongoose.model('Account', accountSchema);
