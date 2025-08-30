const mongoose = require('mongoose');
const { Schema } = mongoose;

const entrySchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  contentTypeId: { type: Schema.Types.ObjectId, ref: 'ContentType', required: true },
  slug: { type: String, required: true },
  status: { type: String, enum: ['draft','scheduled','published','archived'], default: 'draft' },
  locales: { type: Schema.Types.Mixed }, // { en: { title, seo }, tr: {...} }
  lexical: { type: Schema.Types.Mixed }, // draft Lexical JSON
  htmlCachedDraft: { type: String },
  published: {
    lexical: { type: Schema.Types.Mixed },
    htmlCached: { type: String },
    seo: { type: Schema.Types.Mixed },
    version: { type: Number, default: 0 },
    publishedAt: { type: Date },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' }
  },
  blocks: { type: [Schema.Types.Mixed] },
  relations: {
    media: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
    categories: [{ type: Schema.Types.ObjectId, ref: 'Term' }],
    tags: [{ type: Schema.Types.ObjectId, ref: 'Tag' }]
  },
  meta: { type: Schema.Types.Mixed },
  site: {
    domainId: { type: Schema.Types.ObjectId, ref: 'Domain' }
  },
  scheduledFor: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' }
});

// Pre-save middleware to update updatedAt field
entrySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Pre-findOneAndUpdate middleware to update updatedAt field
entrySchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: new Date() });
  next();
});

// Indexes
entrySchema.index({ tenantId: 1, contentTypeId: 1, slug: 1 }, { unique: true });
entrySchema.index({ tenantId: 1, status: 1, publishedAt: -1 });
entrySchema.index({ tenantId: 1, 'site.domainId': 1, slug: 1 });
entrySchema.index({ tenantId: 1, 'relations.tags': 1 });

const Entry = mongoose.model('Entry', entrySchema);

module.exports = Entry;
