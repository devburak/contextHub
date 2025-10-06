const mongoose = require('mongoose');
const { Schema } = mongoose;

const formVersionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  formId: { type: Schema.Types.ObjectId, ref: 'FormDefinition', required: true, index: true },
  version: { type: Number, required: true },
  
  // Snapshot of form state at this version
  title: { type: Schema.Types.Mixed, required: true }, // i18n map
  description: { type: Schema.Types.Mixed },
  fields: { type: Schema.Types.Mixed, required: true }, // Full field definitions array
  settings: { type: Schema.Types.Mixed }, // Form settings snapshot
  status: { type: String, enum: ['draft', 'published', 'archived'] },
  visibility: { type: String, enum: ['public', 'authenticated'] },
  
  // Version metadata
  changeNote: { type: String }, // Optional note about what changed
  changeType: { 
    type: String, 
    enum: ['created', 'updated', 'published', 'archived', 'restored'],
    default: 'updated'
  },
  
  // What changed (for diff view)
  changes: {
    fieldsAdded: [{ type: String }], // Field IDs
    fieldsRemoved: [{ type: String }],
    fieldsModified: [{ type: String }],
    settingsChanged: { type: Boolean, default: false },
    statusChanged: { type: Boolean, default: false }
  },
  
  // Audit fields
  createdAt: { type: Date, default: Date.now, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Compound index for version queries
formVersionSchema.index({ tenantId: 1, formId: 1, version: -1 });
formVersionSchema.index({ formId: 1, version: 1 }, { unique: true });

// Static method to get latest version
formVersionSchema.statics.getLatestVersion = async function(formId) {
  return await this.findOne({ formId })
    .sort({ version: -1 })
    .lean();
};

// Static method to get version history with pagination
formVersionSchema.statics.getVersionHistory = async function(formId, { page = 1, limit = 20 } = {}) {
  const skip = (page - 1) * limit;
  
  const versions = await this.find({ formId })
    .sort({ version: -1 })
    .skip(skip)
    .limit(limit)
    .populate('createdBy', 'firstName lastName email')
    .lean();
  
  const total = await this.countDocuments({ formId });
  
  return {
    versions,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// Static method to compare two versions
formVersionSchema.statics.compareVersions = async function(formId, fromVersion, toVersion) {
  const [from, to] = await Promise.all([
    this.findOne({ formId, version: fromVersion }).lean(),
    this.findOne({ formId, version: toVersion }).lean()
  ]);
  
  if (!from || !to) {
    throw new Error('One or both versions not found');
  }
  
  // Simple comparison - can be enhanced with detailed field-by-field diff
  return {
    from: {
      version: from.version,
      createdAt: from.createdAt,
      createdBy: from.createdBy
    },
    to: {
      version: to.version,
      createdAt: to.createdAt,
      createdBy: to.createdBy
    },
    differences: {
      title: from.title !== to.title,
      description: from.description !== to.description,
      fieldsCount: from.fields?.length !== to.fields?.length,
      statusChanged: from.status !== to.status
    }
  };
};

const FormVersion = mongoose.model('FormVersion', formVersionSchema);

module.exports = FormVersion;
