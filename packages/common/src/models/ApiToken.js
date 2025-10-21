const mongoose = require('mongoose');
const { Schema } = mongoose;

const apiTokenSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  name: { type: String, required: true },
  hash: { type: String, required: true },
  role: {
    type: String,
    enum: ['viewer', 'author', 'editor', 'admin', 'owner'],
    default: 'editor',
    required: true
  },
  scopes: [{ type: String }],
  expiresAt: { type: Date },
  lastUsedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Index
apiTokenSchema.index({ tenantId: 1, hash: 1 });
apiTokenSchema.index({ tenantId: 1, scopes: 1 });

const ApiToken = mongoose.model('ApiToken', apiTokenSchema);

module.exports = ApiToken;
