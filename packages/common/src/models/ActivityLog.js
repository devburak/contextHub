const mongoose = require('mongoose')
const { Schema } = mongoose

const activityLogSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'user.login',
      'user.login.failed',
      'user.login.blocked',
      'user.logout',
      'user.register',
      'user.email.verified',
      'user.email.verification.resend',
      'user.email.verification.failed',
      'user.password.forgot',
      'user.password.reset',
      'user.password.change',
      'user.profile.update',
      'user.delete',
      'user.mfa.enabled',
      'user.mfa.disabled',
      'user.mfa.challenge.succeeded',
      'user.mfa.challenge.failed',
      'session.created',
      'session.refreshed',
      'session.tenant.switched',
      'session.revoked',
      'session.revoked.all',
      'api_token.created',
      'api_token.updated',
      'api_token.deleted',
      'api_token.used',
      'tenant.create',
      'tenant.update',
      'tenant.delete',
      'tenant.ownership.transfer',
      'membership.join',
      'membership.leave',
      'content.create',
      'content.update',
      'content.delete',
      'other'
    ],
    index: true
  },
  description: {
    type: String,
    required: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
})

// Compound index for efficient queries
activityLogSchema.index({ tenant: 1, createdAt: -1 })
activityLogSchema.index({ user: 1, createdAt: -1 })
activityLogSchema.index({ action: 1, createdAt: -1 })

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema)

module.exports = ActivityLog
