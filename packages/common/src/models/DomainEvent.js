const mongoose = require('mongoose');

const { Schema } = mongoose;
const DOMAIN_EVENT_RETENTION_SECONDS = 180 * 24 * 60 * 60;

const domainEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    id: { type: String, required: true },
    // Optional during the controlled F2 backfill; all newly emitted events have it.
    sequence: { type: Number, min: 1 },
    tenantId: { type: String, required: true },
    type: { type: String, required: true },
    occurredAt: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ['pending', 'processing', 'queued', 'skipped'],
      default: 'pending'
    },
    retryCount: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    collection: 'DomainEvents',
    skipTenantEnforcement: true,
    versionKey: false
  }
);

domainEventSchema.index({ status: 1, createdAt: 1 });
domainEventSchema.index(
  { sequence: 1 },
  {
    unique: true,
    partialFilterExpression: { sequence: { $type: 'number' } }
  }
);
domainEventSchema.index(
  { tenantId: 1, sequence: 1 },
  { partialFilterExpression: { sequence: { $type: 'number' } } }
);
domainEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: DOMAIN_EVENT_RETENTION_SECONDS }
);

const DomainEvent = mongoose.model('DomainEvent', domainEventSchema);

module.exports = DomainEvent;
