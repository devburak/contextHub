const mongoose = require('mongoose');
const { Schema } = mongoose;

const dailyAggSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: 'Tenant', required: true },
  domainId: { type: Schema.Types.ObjectId, ref: 'Domain' },
  day: { type: Date, required: true },
  path: { type: String },
  pv: { type: Number, default: 0 },
  uv: { type: Number, default: 0 },
  events: { type: Schema.Types.Mixed }
});

// Index
dailyAggSchema.index({ tenantId: 1, domainId: 1, day: -1, path: 1 });

const DailyAgg = mongoose.model('DailyAgg', dailyAggSchema);

module.exports = DailyAgg;
