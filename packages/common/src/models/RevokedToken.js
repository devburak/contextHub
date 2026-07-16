const mongoose = require('mongoose');
const { Schema } = mongoose;

const revokedTokenSchema = new Schema({
  jti: { type: String, required: true, unique: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: Date.now },
  reason: { type: String, default: 'logout' },
}, {
  skipTenantEnforcement: true,
});

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
