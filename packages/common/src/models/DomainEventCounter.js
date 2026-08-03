const mongoose = require('mongoose');

const { Schema } = mongoose;

const domainEventCounterSchema = new Schema(
  {
    _id: { type: String, required: true },
    sequence: { type: Number, required: true, min: 0, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
  },
  {
    collection: 'DomainEventCounters',
    skipTenantEnforcement: true,
    versionKey: false
  }
);

const DomainEventCounter = mongoose.model(
  'DomainEventCounter',
  domainEventCounterSchema
);

module.exports = DomainEventCounter;
