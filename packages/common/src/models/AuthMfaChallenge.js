const mongoose = require('mongoose');
const { Schema } = mongoose;

const schema = new Schema({
  _id: { type: String }, // SHA-256 of an opaque, random challenge cookie/token.
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  purpose: { type: String, enum: ['login', 'enroll-totp', 'enroll-email'], required: true },
  tokenVersion: { type: Number, required: true },
  primaryAuth: { type: String, enum: ['password', 'google'], required: true },
  authAt: { type: Number, required: true },
  tenantId: { type: String, default: null },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, required: true },
  secretEncrypted: { type: String, select: false },
  emailCodeHash: { type: String, select: false },
  emailExpiresAt: { type: Date },
  emailSentAt: { type: Date },
}, { collection: 'auth_mfa_challenges', skipTenantEnforcement: true });

schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('AuthMfaChallenge', schema);
