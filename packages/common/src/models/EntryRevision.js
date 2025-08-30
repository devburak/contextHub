const mongoose = require('mongoose');
const { Schema } = mongoose;

const entryRevisionSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  entryId: { type: Schema.Types.ObjectId, ref: 'Entry', required: true },
  version: { type: Number, required: true },
  status: { type: String },
  locales: { type: Schema.Types.Mixed },
  lexical: { type: Schema.Types.Mixed },
  html: { type: String },
  seo: { type: Schema.Types.Mixed },
  meta: { type: Schema.Types.Mixed },
  publishedAt: { type: Date },
  publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  diffBaseVersion: { type: Number },
  size: { type: Number },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Index
entryRevisionSchema.index({ tenantId: 1, entryId: 1, version: -1 });

const EntryRevision = mongoose.model('EntryRevision', entryRevisionSchema);

module.exports = EntryRevision;
