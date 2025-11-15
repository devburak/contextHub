const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * @typedef {Object} WebhookOutboxJob
 * @property {string} _id
 * @property {string} tenantId
 * @property {string} webhookId
 * @property {string} eventId
 * @property {string} type
 * @property {Object} payload
 * @property {'pending'|'processing'|'done'|'failed'} status
 * @property {number} retryCount
 * @property {string|null} lastError
 * @property {Date} createdAt
 * @property {Date|null} [updatedAt]
 */
const webhookOutboxSchema = new Schema({
  tenantId: { type: String, required: true, index: true },
  webhookId: { type: Schema.Types.ObjectId, ref: 'Webhook', required: true },
  eventId: { type: String, required: true },
  type: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'done', 'failed'],
    default: 'pending'
  },
  retryCount: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: null }
});

webhookOutboxSchema.pre('save', function setUpdatedAt(next) {
  if (!this.isNew) {
    this.updatedAt = new Date();
  }
  next();
});

webhookOutboxSchema.index({ status: 1, createdAt: 1 });
webhookOutboxSchema.index({ webhookId: 1, status: 1 });

const WebhookOutbox = mongoose.model('WebhookOutbox', webhookOutboxSchema);

module.exports = WebhookOutbox;
