const mongoose = require('mongoose');
const { Schema } = mongoose;

const roleSchema = new Schema({
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null
  },
  key: {
    type: String,
    required: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  level: {
    type: Number,
    required: true,
    min: 0
  },
  permissions: [{
    type: String,
    trim: true
  }],
  isDefault: {
    type: Boolean,
    default: false
  },
  isSystem: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, { skipTenantEnforcement: true });

roleSchema.index({ tenantId: 1, key: 1 }, { unique: true });
roleSchema.index({ tenantId: 1, level: -1 });

roleSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

roleSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
