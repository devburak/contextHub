const mongoose = require('mongoose');

const apiUsageSyncStateSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  lastPeriodKey: {
    type: String,
    default: null,
  },
  lastPeriodEnd: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

const ApiUsageSyncState = mongoose.model('ApiUsageSyncState', apiUsageSyncStateSchema);

module.exports = ApiUsageSyncState;
