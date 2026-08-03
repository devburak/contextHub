const mongoose = require('mongoose');

const { Schema } = mongoose;

const domainEventDeadLetterSchema = new Schema(
  {
    consumer: { type: String, required: true, trim: true },
    partition: { type: String, required: true, trim: true },
    eventId: { type: String, required: true },
    eventSequence: { type: Number, required: true, min: 1 },
    tenantId: { type: String, required: true },
    eventType: { type: String, required: true },
    event: { type: Schema.Types.Mixed, required: true },
    attempts: { type: Number, required: true, min: 1 },
    error: { type: Schema.Types.Mixed, required: true },
    failedAt: { type: Date, required: true, default: Date.now },
    resolvedAt: { type: Date, default: null },
    resolution: { type: Schema.Types.Mixed, default: null }
  },
  {
    collection: 'DomainEventDeadLetters',
    skipTenantEnforcement: true,
    timestamps: true,
    versionKey: false
  }
);

domainEventDeadLetterSchema.index(
  { consumer: 1, partition: 1, eventSequence: 1 },
  { unique: true }
);
domainEventDeadLetterSchema.index({ resolvedAt: 1, failedAt: 1 });

const DomainEventDeadLetter = mongoose.model(
  'DomainEventDeadLetter',
  domainEventDeadLetterSchema
);

module.exports = DomainEventDeadLetter;
