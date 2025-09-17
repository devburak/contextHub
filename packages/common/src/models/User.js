const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { Schema } = mongoose;

const userSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant' },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  firstName: { type: String },
  lastName: { type: String },
  name: { type: String },
  status: { type: String, default: 'active', enum: ['active', 'inactive', 'suspended'] },
  isEmailVerified: { type: Boolean, default: false },
  lastLoginAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to hash password and update updatedAt
userSchema.pre('save', async function(next) {
  // Hash password if it's modified
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  
  // Keep derived name in sync when first/last name values exist
  if (this.isModified('firstName') || this.isModified('lastName')) {
    const parts = [this.firstName, this.lastName].filter(Boolean);
    if (parts.length) {
      this.name = parts.join(' ').trim();
    }
  }
  
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
userSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

// Index
userSchema.index({ email: 1 }, { unique: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
