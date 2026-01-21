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
 * @property {'pending'|'processing'|'done'|'failed'|'dead'} status
 * @property {number} retryCount
 * @property {string|null} lastError
 * @property {string|null} errorType - 'transient' | 'permanent' | 'timeout' | null
 * @property {number|null} lastHttpStatus - Son HTTP yanıt kodu
 * @property {number|null} lastDurationMs - Son istek süresi (ms)
 * @property {Date|null} nextRetryAt - Bir sonraki retry zamanı (exponential backoff)
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
    enum: ['pending', 'processing', 'done', 'failed', 'dead'],
    default: 'pending'
  },
  retryCount: { type: Number, default: 0 },
  lastError: { type: String, default: null },
  errorType: {
    type: String,
    enum: ['transient', 'permanent', 'timeout', null],
    default: null
  },
  lastHttpStatus: { type: Number, default: null },
  lastDurationMs: { type: Number, default: null },
  nextRetryAt: { type: Date, default: null },
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
webhookOutboxSchema.index({ status: 1, nextRetryAt: 1 }); // Retry zamanına göre sorgulama için
webhookOutboxSchema.index({ tenantId: 1, status: 1, nextRetryAt: 1 }); // Tenant bazlı retry sorgulama

const WebhookOutbox = mongoose.model('WebhookOutbox', webhookOutboxSchema);

module.exports = WebhookOutbox;
