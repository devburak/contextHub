const mongoose = require('mongoose');

const { Schema } = mongoose;

const domainEventCursorSchema = new Schema(
  {
    consumer: { type: String, required: true, trim: true },
    partition: { type: String, required: true, trim: true },
    active: { type: Boolean, default: true },
    initialPosition: {
      type: String,
      enum: ['earliest', 'latest', 'backfill'],
      required: true
    },
    lastSequence: { type: Number, min: 0, default: 0 },
    highWatermark: { type: Number, min: 0, default: null },
    backfillStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: null
    },
    backfillCompletedAt: { type: Date, default: null },
    leaseOwner: { type: String, default: null },
    leaseUntil: { type: Date, default: null },
    failureSequence: { type: Number, min: 1, default: null },
    attempt: { type: Number, min: 0, default: 0 },
    nextAttemptAt: { type: Date, default: null },
    lastError: { type: Schema.Types.Mixed, default: null }
  },
  {
    collection: 'DomainEventCursors',
    skipTenantEnforcement: true,
    timestamps: true,
    versionKey: false
  }
);

domainEventCursorSchema.index(
  { consumer: 1, partition: 1 },
  { unique: true }
);
domainEventCursorSchema.index({ active: 1, nextAttemptAt: 1, leaseUntil: 1 });

const DomainEventCursor = mongoose.model(
  'DomainEventCursor',
  domainEventCursorSchema
);

module.exports = DomainEventCursor;
