const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * @typedef {Object} Webhook
 * @property {string} _id
 * @property {string} tenantId
 * @property {string} url
 * @property {string} secret
 * @property {boolean} isActive
 * @property {string[]} events
 * @property {Date} createdAt
 * @property {Date} [updatedAt]
 */
const webhookSchema = new Schema({
  tenantId: { type: String, required: true, index: true },
  url: { type: String, required: true, trim: true },
  secret: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  events: { type: [String], default: ['*'] },
  provider: { type: String, enum: ['webhook', 'slack', 'telegram', 'whatsapp'], default: 'webhook' },
  configEncrypted: { type: String },
  integration: { type: Schema.Types.Mixed },
  payloadMode: { type: String, enum: ['event', 'ids'], default: 'event' },
  filters: {
    locales: { type: [String], default: [] },
    environments: { type: [String], default: [] },
    collectionKeys: { type: [String], default: [] }
  },
  consecutiveFailures: { type: Number, default: 0 },
  disabledAt: { type: Date, default: null },
  notificationPending: { type: Boolean, default: false },
  notificationAttemptAt: { type: Date, default: null },
  notificationSentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
});

webhookSchema.pre('save', function setUpdatedAt(next) {
  if (!this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

webhookSchema.index({ tenantId: 1, url: 1 }, { unique: true });

const Webhook = mongoose.model('Webhook', webhookSchema);

module.exports = Webhook;
