const mongoose = require('mongoose');
const { Schema } = mongoose;

const membershipSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  role: { 
    type: String, 
    enum: ['viewer', 'author', 'editor', 'admin', 'owner'], 
    required: true 
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'active'
  },
  domainScopes: [{
    domainId: { type: Schema.Types.ObjectId, ref: 'Domain' },
    roles: [{ type: String }]
  }],
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  invitedAt: { type: Date },
  acceptedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
membershipSchema.pre('save', function(next) {
  // Auto-fill invitation timestamps when status transitions
  if (this.isModified('status')) {
    if (this.status === 'pending' && !this.invitedAt) {
      this.invitedAt = new Date();
    }
    if (this.status === 'active' && !this.acceptedAt) {
      this.acceptedAt = new Date();
    }
  }

  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
membershipSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate() || {};
  const set = update.$set || {};

  if (Object.prototype.hasOwnProperty.call(update, 'status')) {
    set.status = update.status;
    delete update.status;
  }
  if (Object.prototype.hasOwnProperty.call(update, 'invitedAt')) {
    set.invitedAt = update.invitedAt;
    delete update.invitedAt;
  }
  if (Object.prototype.hasOwnProperty.call(update, 'acceptedAt')) {
    set.acceptedAt = update.acceptedAt;
    delete update.acceptedAt;
  }

  if (set.status) {
    if (set.status === 'pending' && !set.invitedAt) {
      set.invitedAt = new Date();
    }
    if (set.status === 'active' && !set.acceptedAt) {
      set.acceptedAt = new Date();
    }
  }

  set.updatedAt = new Date();
  update.$set = set;
  this.setUpdate(update);
  next();
});

// Index
membershipSchema.index({ tenantId: 1, userId: 1 }, { unique: true });

const Membership = mongoose.model('Membership', membershipSchema);

module.exports = Membership;
