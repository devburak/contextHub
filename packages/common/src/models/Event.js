const mongoose = require('mongoose');
const { Schema } = mongoose;

const eventSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  domainId: { type: Schema.Types.ObjectId, ref: 'Domain' },
  type: { type: String, required: true },
  path: { type: String },
  ref: { type: String },
  ua: { type: String },
  ts: { type: Date, default: Date.now },
  ip: { type: String }
});

// Index
eventSchema.index({ tenantId: 1, domainId: 1, ts: -1 });

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;
