const mongoose = require('mongoose')
const { Schema } = mongoose

const activityLogSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
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
      'user.logout',
      'user.register',
      'user.password.forgot',
      'user.password.reset',
      'user.password.change',
      'user.profile.update',
      'user.delete',
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
